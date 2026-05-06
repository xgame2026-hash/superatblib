import {
  fetchMorphoBlueBaseDashboardSnapshot,
  fetchMorphoBlueEthereumDashboardSnapshot,
} from "./morpho-blue-api.js";

type MorphoOpportunityKind = "liquidatable" | "near-liquidation" | "risky";

function readArg(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) {
    return inline.slice(name.length + 3);
  }

  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index >= 0) {
    return process.argv[index + 1];
  }

  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --limit value: ${value}`);
  }
  return Math.trunc(parsed);
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return parsed;
}

function normalizeKind(value: string | undefined): MorphoOpportunityKind | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "liquidatable" || value === "near-liquidation" || value === "risky") {
    return value;
  }
  throw new Error(`Unsupported --kind value: ${value}`);
}

function shortAddress(value: string): string {
  return value.length >= 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1_000 ? 0 : 2,
  }).format(value);
}

function formatHf(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return value.toFixed(3);
}

function formatGap(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function renderLines(payload: Awaited<ReturnType<typeof fetchMorphoBlueEthereumDashboardSnapshot>>): string {
  const executionCandidates = Array.isArray(payload.analysis.topExecutionCandidates)
    ? payload.analysis.topExecutionCandidates
    : [];
  const lines = [
    "",
    `Protocol: Morpho Blue`,
    `Chain: Ethereum (1)`,
    `Fetched: ${payload.fetchedAt}`,
    `Risk window: HF <= ${payload.analysis.thresholdHealthFactor}`,
    `Low-HF positions: ${payload.analysis.riskyPositions}`,
    `Near liquidation: ${payload.analysis.nearLiquidationPositions}`,
    `Liquidatable: ${payload.analysis.liquidatablePositions}`,
    `Low-HF borrow: ${formatUsd(payload.analysis.riskyBorrowAssetsUsd)}`,
    "",
    "Top execution-candidate opportunities:",
  ];

  if (!executionCandidates.length) {
    lines.push(
      payload.analysis.topOpportunities.length
        ? "No low-HF position passed execution candidacy filtering in the current watch window."
        : "No low-HF positions in the current watch window.",
    );
    return lines.join("\n");
  }

  executionCandidates.forEach((item, index) => {
    lines.push(
      `#${index + 1} ${item.marketLabel} | ${item.loanSymbol} / ${item.collateralSymbol} | ${shortAddress(item.user)} | ${item.kind} | HF ${formatHf(item.healthFactor)} | ${formatUsd(item.borrowAssetsUsd)} | ${formatGap(item.priceVariationToLiquidationPrice)}`,
    );
  });

  lines.push("");
  lines.push(payload.analysis.disclaimer);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const chain = readArg("chain") === "base" ? "base" : "ethereum";
  const marketId = readArg("marketId");
  const limit = parsePositiveInteger(readArg("limit"), 10);
  const hfMax = parseOptionalNumber(readArg("hfMax"));
  const kind = normalizeKind(readArg("kind"));
  const json = hasFlag("json");
  const refresh = hasFlag("refresh");

  const snapshot = chain === "base"
    ? await fetchMorphoBlueBaseDashboardSnapshot({ force: refresh })
    : await fetchMorphoBlueEthereumDashboardSnapshot({ force: refresh });
  let topOpportunities = (
    Array.isArray(snapshot.analysis.topExecutionCandidates) &&
    snapshot.analysis.topExecutionCandidates.length
  )
    ? snapshot.analysis.topExecutionCandidates.slice()
    : snapshot.analysis.topOpportunities.slice();
  if (marketId) {
    topOpportunities = topOpportunities.filter(
      (item) => item.marketId.toLowerCase() === marketId.toLowerCase(),
    );
  }
  if (kind) {
    topOpportunities = topOpportunities.filter((item) => item.kind === kind);
  }
  if (typeof hfMax === "number") {
    topOpportunities = topOpportunities.filter(
      (item) => typeof item.healthFactor === "number" && item.healthFactor <= hfMax,
    );
  }
  topOpportunities = topOpportunities.slice(0, limit);

  const markets = marketId
    ? snapshot.markets.filter(
        (item) => item.marketId.toLowerCase() === marketId.toLowerCase(),
      )
    : snapshot.markets;

  const output = {
    ok: true,
    protocol: snapshot.protocol,
    chain: snapshot.chain,
    chainId: snapshot.chainId,
    fetchedAt: snapshot.fetchedAt,
    stale: snapshot.stale,
    analysis: {
      ...snapshot.analysis,
      topOpportunities,
    },
    markets,
  };

  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(renderLines(output as Awaited<ReturnType<typeof fetchMorphoBlueEthereumDashboardSnapshot>>));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
