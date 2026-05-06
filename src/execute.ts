import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, bsc, mainnet, polygon } from "viem/chains";

import { poolAbi } from "./abi.js";
import {
  executeBroadcastPlan,
  resolveBroadcastTransport,
} from "./broadcast-plan.js";
import { loadCliOptions } from "./config.js";
import {
  buildPreparedExecution,
  erc20Abi,
  hasFlag,
  readArg,
} from "./execution-plan.js";
import { resolveMarket } from "./market.js";
import { evaluateProfitability } from "./profit-check.js";

const CHAIN_MAP = {
  1: mainnet,
  56: bsc,
  137: polygon,
  42161: arbitrum,
} as const;

function toAddress(value: string | undefined): Address | undefined {
  return value ? getAddress(value) : undefined;
}

function readNumberArg(name: string, fallback: number): number {
  const raw = readArg(name);
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number for ${name}: ${raw}`);
  }

  return value;
}

function readBooleanEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function isStrictlyProfitable(report: Awaited<ReturnType<typeof evaluateProfitability>>): boolean {
  if (!report.canBroadcast) {
    return false;
  }
  if (report.estimatedNetProfitBase !== undefined) {
    return BigInt(report.estimatedNetProfitBase) > 0n;
  }
  if (report.grossProfitBase !== undefined) {
    return BigInt(report.grossProfitBase) > 0n;
  }
  return false;
}

function getExecutionAccount(): {
  mode: "private_key" | "address_only";
  address: Address;
  privateKey?: Hex;
} {
  const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
  if (privateKey) {
    const account = privateKeyToAccount(privateKey);
    return {
      mode: "private_key",
      address: account.address,
      privateKey,
    };
  }

  const fromArg = toAddress(readArg("from"));
  const fromEnv = toAddress(process.env.LIQUIDATOR_ADDRESS);
  const address = fromArg ?? fromEnv;

  if (!address) {
    throw new Error(
      "Missing execution account. Set PRIVATE_KEY, --from, or LIQUIDATOR_ADDRESS.",
    );
  }

  return {
    mode: "address_only",
    address,
  };
}

async function main(): Promise<void> {
  const options = loadCliOptions();
  const targetUser = toAddress(readArg("user"));
  const allowRisky = hasFlag("allowRisky");
  const receiveAToken = hasFlag("receiveAToken");
  const broadcast = hasFlag("broadcast");
  const gasBufferBps = BigInt(readNumberArg("gasBufferBps", 12500));
  const minNetProfit = readArg("minNetProfit") ?? process.env.MIN_NET_PROFIT ?? "0";
  const skipProfitCheck =
    hasFlag("skipProfitCheck") || readBooleanEnv("SKIP_PROFIT_CHECK");
  const flashbotsAuthPrivateKey = (process.env.FLASHBOTS_AUTH_PRIVATE_KEY ??
    process.env.PRIVATE_KEY) as `0x${string}` | undefined;

  const publicClient = createPublicClient({
    transport: http(options.rpcUrl),
  });
  const executionAccount = getExecutionAccount();
  const market = await resolveMarket(
    publicClient,
    options.chain,
    options.market,
    options.configuredAddressProvider,
  );
  const prepared = await buildPreparedExecution(publicClient, options, {
    targetUser,
    allowRisky,
    receiveAToken,
  });

  const chain = CHAIN_MAP[prepared.chainId as keyof typeof CHAIN_MAP];
  if (!chain) {
    throw new Error(`Unsupported chain for wallet execution: ${prepared.chainId}`);
  }
  const broadcastTransport = resolveBroadcastTransport(
    readArg("broadcastTransport") ??
      process.env.BROADCAST_TRANSPORT ??
      (prepared.chainId === 1 ? "flashbots_bundle" : undefined),
  );

  const nativeBalance = await publicClient.getBalance({
    address: executionAccount.address,
  });
  const [debtTokenBalance, allowance] = await Promise.all([
    publicClient.readContract({
      address: prepared.approve.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [executionAccount.address],
    }),
    publicClient.readContract({
      address: prepared.approve.token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [executionAccount.address, prepared.pool],
    }),
  ]);

  const needsApprove = allowance < prepared.approve.amount;
  const hasDebtBalance = debtTokenBalance >= prepared.approve.amount;

  let approveSimulation:
    | { ok: true; gas?: string }
    | { ok: false; reason: string }
    | undefined;
  let liquidationSimulation:
    | { ok: true; gas?: string }
    | { ok: false; reason: string }
    | undefined;

  try {
    const simulatedApprove = await publicClient.simulateContract({
      address: prepared.approve.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [prepared.approve.spender, prepared.approve.amount],
      account: executionAccount.address,
    });

    approveSimulation = {
      ok: true,
      gas: simulatedApprove.request.gas?.toString(),
    };
  } catch (error) {
    approveSimulation = {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (!hasDebtBalance) {
    liquidationSimulation = {
      ok: false,
      reason: `Execution account holds ${debtTokenBalance.toString()} debt tokens, below required ${prepared.approve.amount.toString()}.`,
    };
  } else if (needsApprove) {
    liquidationSimulation = {
      ok: false,
      reason:
        "Allowance is below debtToCover. Approve must be mined before liquidation simulation can be trusted.",
    };
  } else {
    try {
      const simulatedLiquidation = await publicClient.simulateContract({
        address: prepared.pool,
        abi: poolAbi,
        functionName: "liquidationCall",
        args: [
          prepared.liquidationCall.collateralAsset,
          prepared.liquidationCall.debtAsset,
          prepared.liquidationCall.user,
          prepared.liquidationCall.debtToCover,
          prepared.liquidationCall.receiveAToken,
        ],
        account: executionAccount.address,
      });

      liquidationSimulation = {
        ok: true,
        gas: simulatedLiquidation.request.gas?.toString(),
      };
    } catch (error) {
      liquidationSimulation = {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const gasPriceWei = await publicClient.getGasPrice();
  const approveGasForCheck =
    needsApprove && approveSimulation && approveSimulation.ok && approveSimulation.gas
      ? BigInt(approveSimulation.gas)
      : needsApprove
        ? 80_000n
        : undefined;
  const executeGasForCheck =
    liquidationSimulation && liquidationSimulation.ok && liquidationSimulation.gas
      ? BigInt(liquidationSimulation.gas)
      : 900_000n;
  const profitCheck = await evaluateProfitability(publicClient, market, prepared, {
    needsApprove,
    approveGas: approveGasForCheck,
    executeGas: executeGasForCheck,
    gasPriceWei,
    gasBufferBps,
    minNetProfit,
    skipProfitCheck,
  });
  const strictlyProfitable = isStrictlyProfitable(profitCheck);
  const profitabilityGate = {
    enabled: !skipProfitCheck,
    profitable: strictlyProfitable,
    canBroadcast: profitCheck.canBroadcast && (skipProfitCheck || strictlyProfitable),
    reason: skipProfitCheck
      ? "Profit check bypassed."
      : !strictlyProfitable
        ? profitCheck.reason ?? "Estimated net profit is not positive."
        : undefined,
  };

  const report = {
    chainId: prepared.chainId,
    chainName: prepared.chainName,
    marketId: prepared.marketId,
    executionAccount: executionAccount.address,
    accountMode: executionAccount.mode,
    selectedUser: prepared.selectedUser,
    liquidatable: prepared.liquidatable,
    selection: prepared.selection,
    approve: {
      ...prepared.approve,
      amount: prepared.approve.amount.toString(),
      needsApprove,
      currentAllowance: allowance.toString(),
      currentBalance: debtTokenBalance.toString(),
      simulation: approveSimulation,
    },
    liquidationCall: {
      ...prepared.liquidationCall,
      debtToCover: prepared.liquidationCall.debtToCover.toString(),
      expectedCollateralToReceive:
        prepared.liquidationCall.expectedCollateralToReceive.toString(),
      expectedGrossProfitBase:
        prepared.liquidationCall.expectedGrossProfitBase.toString(),
      expectedNetProfitBase:
        prepared.liquidationCall.expectedNetProfitBase,
      expectedNetProfitDisplay:
        prepared.liquidationCall.expectedNetProfitDisplay,
      simulation: liquidationSimulation,
    },
    nativeBalance: {
      wei: nativeBalance.toString(),
      ether: formatEther(nativeBalance),
    },
    gasBufferBps: gasBufferBps.toString(),
    minNetProfit,
    profitCheck,
    profitabilityGate,
    broadcast,
    broadcastTransport,
  };

  if (!broadcast) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (executionAccount.mode !== "private_key" || !executionAccount.privateKey) {
    throw new Error("Broadcast requires PRIVATE_KEY.");
  }

  if (!hasDebtBalance) {
    throw new Error(
      "Broadcast aborted: execution account does not hold enough debt asset to cover liquidation.",
    );
  }
  if (!profitabilityGate.canBroadcast) {
    throw new Error(
      `Broadcast aborted: ${profitabilityGate.reason ?? "estimated profit gate did not pass."}`,
    );
  }

  const walletAccount = privateKeyToAccount(executionAccount.privateKey);
  const walletClient = createWalletClient({
    account: walletAccount,
    chain,
    transport: http(options.executionRpcUrl),
  });

  const submission = await executeBroadcastPlan({
    transport: broadcastTransport,
    chainId: prepared.chainId,
    publicClient,
    walletClient,
    authPrivateKey: flashbotsAuthPrivateKey,
    steps: [
      ...(needsApprove
        ? [
            {
              label: "approve",
              request: {
                address: prepared.approve.token,
                abi: erc20Abi,
                functionName: "approve",
                args: [prepared.approve.spender, prepared.approve.amount],
                chain,
                account: walletAccount,
                gas:
                  approveSimulation && approveSimulation.ok && approveSimulation.gas
                    ? BigInt(approveSimulation.gas)
                    : undefined,
                gasFallback: 80_000n,
              },
            },
          ]
        : []),
      {
        label: "liquidation",
        request: {
          address: prepared.pool,
          abi: poolAbi,
          functionName: "liquidationCall",
          args: [
            prepared.liquidationCall.collateralAsset,
            prepared.liquidationCall.debtAsset,
            prepared.liquidationCall.user,
            prepared.liquidationCall.debtToCover,
            prepared.liquidationCall.receiveAToken,
          ],
          chain,
          account: walletAccount,
          gas:
            liquidationSimulation &&
            liquidationSimulation.ok &&
            liquidationSimulation.gas
              ? BigInt(liquidationSimulation.gas)
              : undefined,
          gasFallback: 900_000n,
        },
      },
    ],
  });

  const approveSubmission = submission.steps.find((item) => item.label === "approve");
  const liquidationSubmission = submission.steps.find(
    (item) => item.label === "liquidation",
  );
  const liquidationReceipt = liquidationSubmission?.receipt;
  if (!liquidationSubmission || !liquidationReceipt) {
    throw new Error("Liquidation broadcast did not produce a receipt.");
  }

  console.log(
    JSON.stringify(
      {
        ...report,
        broadcastResult: {
          transport: submission.transport,
          transportMetadata: submission.metadata,
          approveTxHash: approveSubmission?.txHash,
          liquidationTxHash: liquidationSubmission.txHash,
          liquidationStatus: liquidationReceipt.status,
          liquidationGasUsed: liquidationReceipt.gasUsed.toString(),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
