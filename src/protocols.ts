export type ProtocolKey = "aave-v3" | "aave-v4" | "sparklend" | "morpho-blue";
export type AaveProtocolKey = Extract<ProtocolKey, "aave-v3" | "aave-v4">;
export type ProtocolAdapterFamily =
  | "pool-address-provider"
  | "isolated-market"
  | "external-api";

export type LiquidationCoverageModel =
  | "close-factor"
  | "target-health-factor";

export type LiquidationBonusModel =
  | "static-bps"
  | "dynamic-health-factor";

export type FlashLoanLiquidityModel =
  | "pool-liquidity"
  | "hub-liquidity";

export type DustHandlingModel = "none" | "dust-prevention";

export type ProtocolDescriptor = {
  key: ProtocolKey;
  label: string;
  status: "active" | "planned";
  adapterFamily: ProtocolAdapterFamily;
  docsUrl: string;
  liquidation: {
    coverageModel: LiquidationCoverageModel;
    bonusModel: LiquidationBonusModel;
    dustHandling: DustHandlingModel;
  };
  flashLoan: {
    available: boolean;
    liquidityModel: FlashLoanLiquidityModel;
  };
  notes: string[];
};

export type AaveProtocolDescriptor = ProtocolDescriptor;

export const AAVE_V3_PROTOCOL: ProtocolDescriptor = {
  key: "aave-v3",
  label: "Aave V3",
  status: "active",
  adapterFamily: "pool-address-provider",
  docsUrl: "https://aave.com/docs/developers/aave-v3/overview",
  liquidation: {
    coverageModel: "close-factor",
    bonusModel: "static-bps",
    dustHandling: "none",
  },
  flashLoan: {
    available: true,
    liquidityModel: "pool-liquidity",
  },
  notes: [
    "Current production path in this repo.",
    "Liquidation quote logic assumes V3 close factor thresholds and reserve-level static bonus bps.",
    "Execution path targets pool.liquidationCall on live V3 markets.",
  ],
};

export const SPARKLEND_PROTOCOL: ProtocolDescriptor = {
  key: "sparklend",
  label: "SparkLend",
  status: "active",
  adapterFamily: "pool-address-provider",
  docsUrl: "https://docs.spark.fi/dev/sparklend/overview",
  liquidation: {
    coverageModel: "close-factor",
    bonusModel: "static-bps",
    dustHandling: "none",
  },
  flashLoan: {
    available: true,
    liquidityModel: "pool-liquidity",
  },
  notes: [
    "SparkLend execution currently reuses the Aave V3-compatible liquidation path.",
    "Pool, address provider, and reserve metadata are Spark-specific even when the liquidation primitive matches V3.",
    "Execution and reporting should be labeled SparkLend to avoid mixing markets at runtime.",
  ],
};

export const AAVE_V4_PROTOCOL: ProtocolDescriptor = {
  key: "aave-v4",
  label: "Aave V4",
  status: "planned",
  adapterFamily: "pool-address-provider",
  docsUrl: "https://aave.com/docs/aave-v4",
  liquidation: {
    coverageModel: "target-health-factor",
    bonusModel: "dynamic-health-factor",
    dustHandling: "dust-prevention",
  },
  flashLoan: {
    available: true,
    liquidityModel: "hub-liquidity",
  },
  notes: [
    "Not wired into the live execution path yet.",
    "Debt-to-cover logic will need to target protocol-defined post-liquidation health factor instead of only V3 close factor buckets.",
    "Bonus modeling will need to be dynamic rather than fixed reserve bps.",
  ],
};

export const MORPHO_BLUE_PROTOCOL: ProtocolDescriptor = {
  key: "morpho-blue",
  label: "Morpho Blue",
  status: "planned",
  adapterFamily: "isolated-market",
  docsUrl: "https://docs.morpho.org/",
  liquidation: {
    coverageModel: "close-factor",
    bonusModel: "static-bps",
    dustHandling: "none",
  },
  flashLoan: {
    available: false,
    liquidityModel: "pool-liquidity",
  },
  notes: [
    "Morpho Blue uses isolated markets rather than a single chain-wide pool/address-provider model.",
    "Reserve discovery, health checks, and liquidation quoting need a dedicated adapter instead of the current Aave-compatible path.",
    "Read-only risk indexing is live, and an execution skeleton boundary now exists to stop Morpho from falling through the Aave runner.",
  ],
};

export const PROTOCOLS: Record<ProtocolKey, ProtocolDescriptor> = {
  "aave-v3": AAVE_V3_PROTOCOL,
  sparklend: SPARKLEND_PROTOCOL,
  "aave-v4": AAVE_V4_PROTOCOL,
  "morpho-blue": MORPHO_BLUE_PROTOCOL,
};

export function describeProtocolForOutput(protocol: ProtocolDescriptor): {
  key: ProtocolKey;
  label: string;
  status: ProtocolDescriptor["status"];
  adapterFamily: ProtocolDescriptor["adapterFamily"];
  docsUrl: string;
  liquidation: ProtocolDescriptor["liquidation"];
  flashLoan: ProtocolDescriptor["flashLoan"];
  notes: string[];
} {
  return {
    key: protocol.key,
    label: protocol.label,
    status: protocol.status,
    adapterFamily: protocol.adapterFamily,
    docsUrl: protocol.docsUrl,
    liquidation: protocol.liquidation,
    flashLoan: protocol.flashLoan,
    notes: [...protocol.notes],
  };
}

export function currentProtocolPreparationSummary(): {
  active: ProtocolDescriptor;
  planned: ProtocolDescriptor;
  adapterBoundaries: string[];
  nextUpgradeWork: string[];
} {
  return {
    active: AAVE_V3_PROTOCOL,
    planned: MORPHO_BLUE_PROTOCOL,
    adapterBoundaries: [
      "Resolved market metadata now carries a protocol descriptor.",
      "Protocol descriptors now expose adapter family so Aave/Spark pool-based markets can be kept separate from isolated-market protocols like Morpho Blue.",
      "CLI outputs now expose protocol mechanics so downstream UI and execution code do not need to hardcode Aave V3 assumptions.",
    ],
    nextUpgradeWork: [
      "Add a Morpho Blue market registry for Ethereum so the dashboard can enumerate isolated markets explicitly.",
      "Turn the Morpho execution skeleton into a route-capable adapter with dedicated repay and unwind planning.",
      "Map isolated-market opportunities into the same candidate ranking surface used by the live lending console.",
      "Add a Morpho-specific private execution path before exposing it as a real execution market.",
    ],
  };
}
