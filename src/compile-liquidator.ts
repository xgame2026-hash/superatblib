import { compileSelfFundedLiquidator } from "./contract-compiler.js";

async function main(): Promise<void> {
  const compiled = compileSelfFundedLiquidator();
  console.log(
    JSON.stringify(
      {
        contractName: compiled.contractName,
        sourcePath: compiled.sourcePath,
        abiItems: compiled.abi.length,
        bytecodeBytes: (compiled.bytecode.length - 2) / 2,
        deployedBytecodeBytes: (compiled.deployedBytecode.length - 2) / 2,
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
