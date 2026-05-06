import { readFileSync } from "node:fs";
import path from "node:path";

import solc from "solc";

export type CompiledContract = {
  abi: unknown[];
  bytecode: `0x${string}`;
  deployedBytecode: `0x${string}`;
  contractName: string;
  sourcePath: string;
};

function compileContract(
  relativeSourcePath: string,
  contractName: string,
): CompiledContract {
  const sourcePath = path.resolve(process.cwd(), relativeSourcePath);
  const source = readFileSync(sourcePath, "utf8");
  const fileName = path.basename(relativeSourcePath);

  const input = {
    language: "Solidity",
    sources: {
      [fileName]: {
        content: source,
      },
    },
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: Array<{ severity: string; formattedMessage: string }>;
    contracts?: Record<
      string,
      Record<
        string,
        {
          abi: unknown[];
          evm: {
            bytecode: { object: string };
            deployedBytecode: { object: string };
          };
        }
      >
    >;
  };

  const errors =
    output.errors?.filter((entry) => entry.severity === "error") ?? [];
  if (errors.length > 0) {
    throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
  }

  const contract =
    output.contracts?.[fileName]?.[contractName];
  if (!contract) {
    throw new Error("Compiled contract output not found.");
  }

  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
    contractName,
    sourcePath,
  };
}

export function compileSelfFundedLiquidator(): CompiledContract {
  return compileContract(
    "contracts/SelfFundedAaveV3Liquidator.sol",
    "SelfFundedAaveV3Liquidator",
  );
}

export function compileFlashLoanLiquidator(): CompiledContract {
  return compileContract(
    "contracts/FlashLoanAaveV3Liquidator.sol",
    "FlashLoanAaveV3Liquidator",
  );
}
