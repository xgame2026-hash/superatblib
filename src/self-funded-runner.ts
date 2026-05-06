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
import {
  CHAIN_PRESETS,
  FundingMode,
  loadCliOptions,
} from "./config.js";
import {
  compileFlashLoanLiquidator,
  compileSelfFundedLiquidator,
} from "./contract-compiler.js";
import {
  resolveConfiguredLiquidatorContract,
  saveDashboardSettings,
} from "./dashboard-settings.js";
import {
  buildPreparedExecutionCandidates,
  erc20Abi,
  hasFlag,
  readArg,
} from "./execution-plan.js";
import { appendExecutionHistory } from "./history.js";
import {
  CandidateExecutionAttempt,
  describeSimulationFailure,
  evaluatePreparedCandidate,
  preselectAutoSwapCandidates,
  summarizeRouteProviders,
} from "./liquidation/execution-attempt.js";
import { resolveMarket } from "./market.js";
import { unsupportedExecutionReasonForProtocol } from "./morpho-execution-skeleton.js";
import {
  parseProfitRecipients,
  planProfitDistribution,
} from "./profit-distribution.js";
import { evaluateRealizedProfit } from "./profit-check.js";

const CHAIN_MAP = {
  1: mainnet,
  56: bsc,
  137: polygon,
  42161: arbitrum,
} as const;

type RunnerMode = {
  historyKey: string;
  allowAutoDeploy: boolean;
  missingContractMessage: string;
  unsupportedChainMessage: string;
};

type DeploymentResult = {
  txHash: `0x${string}`;
  gasUsed: string;
};

type NonExecutableReport = {
  ok: false;
  chainName?: string;
  marketId?: string;
  executionMarketKey?: string;
  executionMarketLabel?: string;
  owner: Address;
  fundingMode: FundingMode;
  selectedUser?: Address;
  liquidatable: false;
  executionGate: {
    routeOk: false;
    simulateOk: false;
    profitable: false;
    canExecute: false;
    reason: string;
  };
  candidateAttempts: [];
  routeProviderSummary: [];
  broadcast: boolean;
  status: "no_candidate";
};

function toAddress(value: string | undefined): Address | undefined {
  return value ? getAddress(value) : undefined;
}

function toOptionalHex(value: string | undefined): Hex | undefined {
  return value as Hex | undefined;
}

function readBooleanEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
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

async function ensureLiquidatorContract(
  executionRpcUrl: string,
  chainId: number,
  fundingMode: FundingMode,
  owner: Address,
  pool: Address,
  existingContract: Address | undefined,
  allowDeploy: boolean,
  missingContractMessage: string,
  account: ReturnType<typeof privateKeyToAccount>,
): Promise<{
  contractAddress: Address;
  deployment?: DeploymentResult;
}> {
  if (existingContract) {
    return { contractAddress: existingContract };
  }

  if (!allowDeploy) {
    throw new Error(missingContractMessage);
  }

  const chain = CHAIN_MAP[chainId as keyof typeof CHAIN_MAP];
  if (!chain) {
    throw new Error(`Unsupported chain for deployment: ${chainId}`);
  }

  const compiled =
    fundingMode === "flash_loan"
      ? compileFlashLoanLiquidator()
      : compileSelfFundedLiquidator();
  const publicClient = createPublicClient({
    transport: http(executionRpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(executionRpcUrl),
  });

  const txHash = await walletClient.deployContract({
    abi: compiled.abi,
    bytecode: compiled.bytecode,
    args: [owner, pool],
    account,
    chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (!receipt.contractAddress) {
    throw new Error("Deployment receipt did not include contractAddress.");
  }

  return {
    contractAddress: getAddress(receipt.contractAddress),
    deployment: {
      txHash,
      gasUsed: receipt.gasUsed.toString(),
    },
  };
}

function resolveChainKeyOrThrow(chainId: number) {
  const preset = CHAIN_PRESETS[chainId];
  if (!preset) {
    throw new Error(`Unsupported chain for contract configuration: ${chainId}`);
  }
  return preset.key;
}

function nonExecutableReason(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message === "No liquidation pair could be derived for the current candidates." ||
    message.startsWith("No actionable users found.") ||
    message.startsWith("No risky snapshot found for user")
  ) {
    return message;
  }
  return undefined;
}

function emitNonExecutableReport(
  mode: RunnerMode,
  report: NonExecutableReport,
): void {
  appendExecutionHistory(mode.historyKey, report as Record<string, unknown>);
  console.log(JSON.stringify(report, null, 2));
}

export async function runSelfFundedLiquidator(mode: RunnerMode): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required.");
  }

  const options = loadCliOptions();
  const fundingMode = options.fundingMode;
  const targetUser = toAddress(readArg("user"));
  const allowRisky = hasFlag("allowRisky");
  const broadcast = hasFlag("broadcast");
  const deploy = mode.allowAutoDeploy
    ? hasFlag("deploy") || readBooleanEnv("AUTO_DEPLOY")
    : false;
  const minCollateralBps = BigInt(readNumberArg("minCollateralBps", 9900));
  const gasBufferBps = BigInt(readNumberArg("gasBufferBps", 12500));
  const minNetProfit = readArg("minNetProfit") ?? process.env.MIN_NET_PROFIT ?? "0";
  const skipProfitCheck =
    hasFlag("skipProfitCheck") || readBooleanEnv("SKIP_PROFIT_CHECK");
  const distributeProfit =
    hasFlag("distributeProfit") || readBooleanEnv("AUTO_DISTRIBUTE_PROFIT");
  const profitRecipients = parseProfitRecipients(
    process.env.PROFIT_RECIPIENTS,
    process.env.PROFIT_SPLIT_BPS,
  );
  const swapTarget = toAddress(readArg("swapTarget") ?? process.env.SWAP_TARGET);
  const swapAllowanceTarget = toAddress(
    readArg("swapAllowanceTarget") ?? process.env.SWAP_ALLOWANCE_TARGET,
  );
  const outputToken = toAddress(readArg("outputToken") ?? process.env.OUTPUT_TOKEN);
  const swapCalldata = toOptionalHex(
    readArg("swapCalldata") ?? process.env.SWAP_CALLDATA,
  );
  const minOutputAmount = BigInt(
    readArg("minOutputAmount") ?? process.env.MIN_OUTPUT_AMOUNT ?? "0",
  );
  const autoSwap = hasFlag("autoSwap") || readBooleanEnv("AUTO_SWAP");
  const swapOutToken = toAddress(
    readArg("swapOutToken") ?? process.env.SWAP_OUT_TOKEN,
  );
  const swapSlippage = readArg("swapSlippage") ?? process.env.SWAP_SLIPPAGE ?? "1";
  const autoSwapSymbols =
    readArg("autoSwapSymbols") ?? process.env.AUTO_SWAP_SYMBOLS;
  const account = privateKeyToAccount(privateKey);
  const protocolUnsupportedReason = unsupportedExecutionReasonForProtocol(
    options.market?.protocol,
    options.market?.label,
  );
  if (protocolUnsupportedReason) {
    emitNonExecutableReport(mode, {
      ok: false,
      chainName: options.chain?.name,
      marketId: options.market?.key,
      executionMarketKey: options.market?.key,
      executionMarketLabel: options.market?.label,
      owner: account.address,
      fundingMode,
      selectedUser: targetUser,
      liquidatable: false,
      executionGate: {
        routeOk: false,
        simulateOk: false,
        profitable: false,
        canExecute: false,
        reason: protocolUnsupportedReason,
      },
      candidateAttempts: [],
      routeProviderSummary: [],
      broadcast,
      status: "no_candidate",
    });
    throw new Error(protocolUnsupportedReason);
  }
  const publicClient = createPublicClient({
    transport: http(options.rpcUrl),
  });
  let preparedCandidates;
  try {
    preparedCandidates = await buildPreparedExecutionCandidates(
      publicClient,
      options,
      {
        targetUser,
        allowRisky,
        receiveAToken: false,
      },
    );
  } catch (error) {
    const reason = nonExecutableReason(error);
    if (!reason) {
      throw error;
    }
    emitNonExecutableReport(mode, {
      ok: false,
      chainName: options.chain?.name,
      marketId: options.market?.key,
      executionMarketKey: options.market?.key,
      executionMarketLabel: options.market?.label,
      owner: account.address,
      fundingMode,
      selectedUser: targetUser,
      liquidatable: false,
      executionGate: {
        routeOk: false,
        simulateOk: false,
        profitable: false,
        canExecute: false,
        reason,
      },
      candidateAttempts: [],
      routeProviderSummary: [],
      broadcast,
      status: "no_candidate",
    });
    throw new Error(reason);
  }
  let prepared = preparedCandidates[0];

  const chain = CHAIN_MAP[prepared.chainId as keyof typeof CHAIN_MAP];
  if (!chain) {
    throw new Error(`${mode.unsupportedChainMessage}: ${prepared.chainId}`);
  }
  const broadcastTransport = resolveBroadcastTransport(
    readArg("broadcastTransport") ??
      process.env.BROADCAST_TRANSPORT ??
      (prepared.chainId === 1 ? "flashbots_bundle" : undefined),
  );

  const market = await resolveMarket(
    publicClient,
    options.chain,
    options.market,
    options.configuredAddressProvider,
  );
  const chainKey = resolveChainKeyOrThrow(market.chainId);
  const flashLoanPremiumBps =
    fundingMode === "flash_loan"
      ? await publicClient.readContract({
          address: market.pool,
          abi: poolAbi,
          functionName: "FLASHLOAN_PREMIUM_TOTAL",
        })
      : undefined;
  const requestedContract = toAddress(
    readArg("contract") ??
      resolveConfiguredLiquidatorContract(
        chainKey,
        undefined,
        options.market?.key,
      ) ??
      process.env.LIQUIDATOR_CONTRACT,
  );
  if (!requestedContract && !mode.allowAutoDeploy) {
    throw new Error(mode.missingContractMessage);
  }
  const { contractAddress, deployment } = await ensureLiquidatorContract(
    options.executionRpcUrl,
    prepared.chainId,
    fundingMode,
    account.address,
    market.pool,
    requestedContract,
    mode.allowAutoDeploy && (broadcast || deploy),
    mode.missingContractMessage,
    account,
  );
  if (deployment) {
    saveDashboardSettings({
      chains:
        options.market?.key === "spark-ethereum"
          ? undefined
          : {
              [chainKey]: {
                liquidatorContract: contractAddress,
              },
            },
      markets: options.market
        ? {
            [options.market.key]: {
              liquidatorContract: contractAddress,
            },
          }
        : undefined,
    });
  }

  const preselectedAutoSwapByKey = await preselectAutoSwapCandidates({
    client: publicClient,
    market,
    preparedCandidates,
    fundingMode,
    ownerAddress: account.address,
    contractAddress,
    autoSwap,
    swapTarget,
    outputToken,
    swapCalldata,
    swapOutToken,
    minCollateralBps,
    swapSlippage,
    autoSwapSymbols,
    flashLoanPremiumBps,
    gasBufferBps,
    minNetProfit,
    skipProfitCheck,
  });
  const blockedSwapRouteCache = new Map<string, string>();
  const blockedRouteStats = { hits: 0 };

  const compiled =
    fundingMode === "flash_loan"
      ? compileFlashLoanLiquidator()
      : compileSelfFundedLiquidator();
  const nativeBalance = await publicClient.getBalance({
    address: account.address,
  });

  const rankedCandidateWindow =
    autoSwap || preparedCandidates.length > 1
      ? preparedCandidates.slice(0, Math.min(5, preparedCandidates.length))
      : [preparedCandidates[0]];
  const liquidatableCandidates = preparedCandidates.filter(
    (candidate) => candidate.liquidatable,
  );
  const candidateWindow = liquidatableCandidates.length > 0
    ? liquidatableCandidates.slice(0, Math.min(5, liquidatableCandidates.length))
    : rankedCandidateWindow;
  const candidateAttempts: CandidateExecutionAttempt[] = [];
  for (const candidate of candidateWindow) {
    const attempt = await evaluatePreparedCandidate({
      client: publicClient,
      market,
      fundingMode,
      ownerAddress: account.address,
      contractAddress,
      compiled,
      candidate,
      minCollateralBps,
      gasBufferBps,
      minNetProfit,
      skipProfitCheck,
      autoSwap,
      swapTarget,
      swapAllowanceTarget,
      outputToken,
      swapCalldata,
      minOutputAmount,
      swapOutToken,
      swapSlippage,
      autoSwapSymbols,
      flashLoanPremiumBps,
      profitRecipients,
      preselectedAutoSwapByKey,
      blockedSwapRouteCache,
      blockedRouteStats,
    });
    candidateAttempts.push(attempt);
    if (attempt.executionGate.canExecute) {
      break;
    }
  }

  const selectedAttempt =
    candidateAttempts.find((attempt) => attempt.executionGate.canExecute) ??
    candidateAttempts[0];
  const routeProviderSummary = summarizeRouteProviders(candidateAttempts);
  prepared = selectedAttempt.prepared;
  const minCollateralReceived = selectedAttempt.minCollateralReceived;
  const debtTokenBalance = selectedAttempt.debtTokenBalance;
  const allowanceToContract = selectedAttempt.allowanceToContract;
  const needsApprove = selectedAttempt.needsApprove;
  const autoSwapSelection = selectedAttempt.autoSwapSelection;
  const autoSwapQuote = selectedAttempt.autoSwapQuote;
  const autoSwapBlockedReason = selectedAttempt.autoSwapBlockedReason;
  const autoSwapProviderAttempts = selectedAttempt.autoSwapProviderAttempts;
  const hasSwap = selectedAttempt.hasSwap;
  const resolvedSwapTarget = selectedAttempt.resolvedSwapTarget;
  const resolvedAllowanceTarget = selectedAttempt.resolvedAllowanceTarget;
  const resolvedOutputToken = selectedAttempt.resolvedOutputToken;
  const resolvedSwapCalldata = selectedAttempt.resolvedSwapCalldata;
  const resolvedMinOutputAmount = selectedAttempt.resolvedMinOutputAmount;
  const approveGasEstimate = selectedAttempt.approveGasEstimate;
  const executeGasEstimate = selectedAttempt.executeGasEstimate;
  const approveSimulation = selectedAttempt.approveSimulation;
  const liquidationSimulation = selectedAttempt.liquidationSimulation;
  const profitCheck = selectedAttempt.profitCheck;
  const estimatedDistribution = selectedAttempt.estimatedDistribution;
  const executionGate = selectedAttempt.executionGate;
  const executeCall = {
    address: contractAddress,
    abi: compiled.abi,
    functionName: hasSwap ? "executeLiquidationAndSwap" : "executeLiquidation",
    args: hasSwap
      ? [
          prepared.liquidationCall.collateralAsset,
          prepared.liquidationCall.debtAsset,
          prepared.liquidationCall.user,
          prepared.liquidationCall.debtToCover,
          minCollateralReceived,
          resolvedSwapTarget as Address,
          (resolvedAllowanceTarget ?? resolvedSwapTarget) as Address,
          resolvedOutputToken as Address,
          resolvedMinOutputAmount,
          resolvedSwapCalldata as Hex,
        ]
      : [
          prepared.liquidationCall.collateralAsset,
          prepared.liquidationCall.debtAsset,
          prepared.liquidationCall.user,
          prepared.liquidationCall.debtToCover,
          minCollateralReceived,
          false,
        ],
    account: account.address,
  } as const;
  const approveGasForCheck =
    approveGasEstimate ??
    (approveSimulation?.ok && approveSimulation.gas
      ? BigInt(approveSimulation.gas)
      : undefined);
  const executeGasForCheck =
    executeGasEstimate ??
    (liquidationSimulation.ok && liquidationSimulation.gas
      ? BigInt(liquidationSimulation.gas)
      : undefined);

  const report = {
    chainId: prepared.chainId,
    chainName: prepared.chainName,
    marketId: prepared.marketId,
    executionMarketKey: prepared.executionMarketKey,
    executionMarketLabel: prepared.executionMarketLabel,
    owner: account.address,
    fundingMode,
    liquidatorContract: contractAddress,
    ...(deployment ? { deployment } : {}),
    selectedUser: prepared.selectedUser,
    liquidatable: prepared.liquidatable,
    selection: prepared.selection,
    minCollateralBps: minCollateralBps.toString(),
    gasBufferBps: gasBufferBps.toString(),
    minCollateralReceived: minCollateralReceived.toString(),
    approveToContract: {
      token: prepared.approve.token,
      symbol: prepared.approve.symbol,
      spender: contractAddress,
      amount: prepared.approve.amount.toString(),
      amountDisplay: prepared.approve.amountDisplay,
      currentAllowance:
        fundingMode === "self_funded" ? allowanceToContract.toString() : undefined,
      currentBalance:
        fundingMode === "self_funded" ? debtTokenBalance.toString() : undefined,
      needsApprove,
      gasEstimate: approveGasEstimate?.toString(),
      simulation: approveSimulation,
    },
    executeLiquidation: {
      mode: hasSwap ? "liquidate_and_swap" : "liquidate_only",
      debtAsset: prepared.liquidationCall.debtAsset,
      debtSymbol: prepared.liquidationCall.debtSymbol,
      collateralAsset: prepared.liquidationCall.collateralAsset,
      collateralSymbol: prepared.liquidationCall.collateralSymbol,
      debtToCover: prepared.liquidationCall.debtToCover.toString(),
      expectedCollateralToReceive:
        prepared.liquidationCall.expectedCollateralToReceive.toString(),
      expectedGrossProfitDisplay:
        prepared.liquidationCall.expectedGrossProfitDisplay,
      expectedNetProfitDisplay:
        prepared.liquidationCall.expectedNetProfitDisplay,
      swap: hasSwap
        ? {
            source: autoSwapSelection
              ? `${autoSwapQuote?.provider ?? "unknown"}_auto`
              : autoSwapQuote
                ? `${autoSwapQuote.provider}_quote`
                : "manual",
            provider: autoSwapQuote?.provider,
            swapTarget: resolvedSwapTarget,
            allowanceTarget: resolvedAllowanceTarget,
            outputToken: resolvedOutputToken,
            minOutputAmount: resolvedMinOutputAmount.toString(),
            swapCalldata: resolvedSwapCalldata,
            quotedInputAmount: autoSwapQuote?.inputAmount.toString(),
            quotedOutputAmount: autoSwapQuote?.outputAmount.toString(),
            estimatedGas: autoSwapQuote?.estimatedGas?.toString(),
            contractGasEstimate: executeGasEstimate?.toString(),
            gasPriceGwei: autoSwapQuote?.gasPriceGwei,
            slippage: autoSwapQuote?.slippage,
            candidatesTried: autoSwapSelection?.candidatesTried,
          }
        : undefined,
      autoSwap: {
        enabled: autoSwap,
        blockedReason: autoSwapBlockedReason,
        candidatesTried: autoSwapSelection?.candidatesTried,
        providerAttempts: autoSwapProviderAttempts,
        routeAttempts: selectedAttempt.routeAttempts,
      },
      simulation: liquidationSimulation,
    },
    nativeBalance: {
      wei: nativeBalance.toString(),
      ether: formatEther(nativeBalance),
    },
    profitCheck,
    executionGate,
    routeProviderSummary,
    blockedRouteCache: {
      size: blockedSwapRouteCache.size,
      hitsThisRun: blockedRouteStats.hits,
    },
    candidateAttempts: candidateAttempts.map((attempt, index) => ({
      rank: index + 1,
      user: attempt.prepared.selectedUser,
      debtSymbol: attempt.prepared.liquidationCall.debtSymbol,
      collateralSymbol: attempt.prepared.liquidationCall.collateralSymbol,
      scoreDisplay: attempt.prepared.selection.scoreDisplay,
      roughNetProfitDisplay:
        attempt.prepared.liquidationCall.expectedNetProfitDisplay,
      hasSwap: attempt.hasSwap,
      canExecute: attempt.executionGate.canExecute,
      reason: attempt.executionGate.reason,
      routeAttempts: attempt.routeAttempts,
    })),
    profitDistributionPlan: estimatedDistribution,
    broadcast,
    broadcastTransport,
    flashLoanPremiumBps: flashLoanPremiumBps?.toString(),
  };

  if (!broadcast) {
    appendExecutionHistory(mode.historyKey, report as Record<string, unknown>);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!executionGate.canExecute) {
    throw new Error(
      `Refusing to broadcast. ${executionGate.reason ?? describeSimulationFailure(liquidationSimulation)}`,
    );
  }

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(options.executionRpcUrl),
  });

  const submission = await executeBroadcastPlan({
    transport: broadcastTransport,
    chainId: prepared.chainId,
    publicClient,
    walletClient,
    authPrivateKey:
      ((process.env.FLASHBOTS_AUTH_PRIVATE_KEY ??
        privateKey) as `0x${string}` | undefined),
    steps: [
      ...(needsApprove
        ? [
            {
              label: "approve",
              request: {
                address: prepared.approve.token,
                abi: erc20Abi,
                functionName: "approve",
                args: [contractAddress, prepared.approve.amount],
                chain,
                account,
                gas: approveGasEstimate ?? approveGasForCheck,
                gasFallback: 80_000n,
              },
            },
          ]
        : []),
      {
        label: "execute",
        request: {
          ...executeCall,
          chain,
          account,
          gas: executeGasEstimate ?? executeGasForCheck,
          gasFallback: hasSwap ? 1_500_000n : 900_000n,
        },
      },
    ],
  });
  const approveSubmission = submission.steps.find((item) => item.label === "approve");
  const executeSubmission = submission.steps.find((item) => item.label === "execute");
  if (!executeSubmission?.receipt) {
    throw new Error("Execution broadcast did not produce a receipt.");
  }

  const collateralBefore = await publicClient.readContract({
    address: prepared.liquidationCall.collateralAsset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const outputBefore =
    hasSwap && resolvedOutputToken
      ? await publicClient.readContract({
          address: resolvedOutputToken as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account.address],
        })
      : undefined;
  const executeTxHash = executeSubmission.txHash;
  const receipt = executeSubmission.receipt;

  const collateralAfter = await publicClient.readContract({
    address: prepared.liquidationCall.collateralAsset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const outputAfter =
    hasSwap && resolvedOutputToken
      ? await publicClient.readContract({
          address: resolvedOutputToken as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account.address],
        })
      : undefined;
  const realizedProfit = await evaluateRealizedProfit(publicClient, market, prepared, {
    outputToken: hasSwap ? (resolvedOutputToken as Address) : undefined,
    outputAmount:
      outputBefore !== undefined && outputAfter !== undefined
        ? outputAfter - outputBefore
        : undefined,
    collateralAmount: collateralAfter - collateralBefore,
    gasUsed: receipt.gasUsed,
    effectiveGasPriceWei: receipt.effectiveGasPrice,
  });
  const realizedDistribution = await planProfitDistribution(publicClient, market, prepared, {
    outputToken: hasSwap ? (resolvedOutputToken as Address) : undefined,
    outputAmount:
      outputBefore !== undefined && outputAfter !== undefined
        ? outputAfter - outputBefore
        : undefined,
    collateralAmount: collateralAfter - collateralBefore,
    recipients: profitRecipients,
  });
  const distributionTxs: Array<{
    recipient: Address;
    amount: string;
    txHash: `0x${string}`;
  }> = [];
  if (distributeProfit && realizedDistribution.canDistribute && realizedDistribution.token) {
    for (const recipient of realizedDistribution.recipients) {
      const amount = BigInt(recipient.amount);
      if (amount === 0n) {
        continue;
      }

      const transferSubmission = await executeBroadcastPlan({
        transport: broadcastTransport,
        chainId: prepared.chainId,
        publicClient,
        walletClient,
        authPrivateKey:
          ((process.env.FLASHBOTS_AUTH_PRIVATE_KEY ??
            privateKey) as `0x${string}` | undefined),
        steps: [
          {
            label: "distribute",
            request: {
              address: realizedDistribution.token,
              abi: erc20Abi,
              functionName: "transfer",
              args: [recipient.address, amount],
              chain,
              account,
              gasFallback: 100_000n,
            },
          },
        ],
      });
      distributionTxs.push({
        recipient: recipient.address,
        amount: recipient.amount,
        txHash: transferSubmission.steps[0].txHash,
      });
    }
  }

  const finalReport = {
    ...report,
    broadcastResult: {
      transport: submission.transport,
      transportMetadata: submission.metadata,
      approveTxHash: approveSubmission?.txHash,
      executeTxHash,
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
      ownerCollateralDelta: (collateralAfter - collateralBefore).toString(),
      ownerOutputDelta:
        outputBefore !== undefined && outputAfter !== undefined
          ? (outputAfter - outputBefore).toString()
          : undefined,
      realizedProfit,
      realizedDistribution,
      profitDistributionExecuted: distributeProfit,
      profitDistributionTxs: distributionTxs,
    },
  };
  appendExecutionHistory(mode.historyKey, finalReport as Record<string, unknown>);
  console.log(JSON.stringify(finalReport, null, 2));
}
