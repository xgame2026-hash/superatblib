export type Phase1ChainKey = "ethereum" | "bnb" | "arbitrum";

export type Phase1Strategy = {
  id: string;
  chain: Phase1ChainKey;
  chainLabel: string;
  protocol: string;
  strategy: string;
  mode: "monitor" | "execute" | "stability_pool";
  rpc: string;
  priority: number;
  minCapitalUsd: number;
  note: string;
};

export const PHASE1_LIQUIDATION_STRATEGIES: Phase1Strategy[] = [
  {
    id: "eth-aave-v3-monitor",
    chain: "ethereum",
    chainLabel: "ETH",
    protocol: "Aave V3",
    strategy: "主网清算监听",
    mode: "monitor",
    rpc: "ETHEREUM_RPC_URL",
    priority: 70,
    minCapitalUsd: 50_000,
    note: "第一期只做候选扫描和快照，执行需要单独开启高 gas 风控。",
  },
  {
    id: "eth-compound-v3-monitor",
    chain: "ethereum",
    chainLabel: "ETH",
    protocol: "Compound V3",
    strategy: "主网清算监听",
    mode: "monitor",
    rpc: "ETHEREUM_RPC_URL",
    priority: 62,
    minCapitalUsd: 50_000,
    note: "记录可清算账户和价格源状态，默认不自动成交。",
  },
  {
    id: "bnb-aave-v3-liquidation",
    chain: "bnb",
    chainLabel: "BNB",
    protocol: "Aave V3",
    strategy: "BSC 长尾清算",
    mode: "execute",
    rpc: "BNB_RPC_URL",
    priority: 95,
    minCapitalUsd: 10_000,
    note: "第一期主策略，候选可进入轮循队列。",
  },
  {
    id: "bnb-venus-liquidation",
    chain: "bnb",
    chainLabel: "BNB",
    protocol: "Venus",
    strategy: "BSC 长尾清算",
    mode: "execute",
    rpc: "BNB_RPC_URL",
    priority: 88,
    minCapitalUsd: 10_000,
    note: "适合 BSC 长尾资产，但需要额外黑名单和滑点保护。",
  },
  {
    id: "bnb-compound-v2-fork-liquidation",
    chain: "bnb",
    chainLabel: "BNB",
    protocol: "Compound V2 Fork",
    strategy: "BSC 长尾清算",
    mode: "execute",
    rpc: "BNB_RPC_URL",
    priority: 82,
    minCapitalUsd: 8_000,
    note: "覆盖 BSC 上 Compound V2 fork 市场，执行前必须校验流动性。",
  },
  {
    id: "arb-aave-v3-liquidation",
    chain: "arbitrum",
    chainLabel: "ARB",
    protocol: "Aave V3",
    strategy: "Arbitrum 清算",
    mode: "execute",
    rpc: "ARBITRUM_RPC_URL",
    priority: 78,
    minCapitalUsd: 15_000,
    note: "低 gas 链可执行，候选不足时只广播心跳快照。",
  },
  {
    id: "arb-liquity-v2-stability-pool",
    chain: "arbitrum",
    chainLabel: "ARB",
    protocol: "Liquity V2",
    strategy: "Stability Pool 收益",
    mode: "stability_pool",
    rpc: "ARBITRUM_RPC_URL",
    priority: 72,
    minCapitalUsd: 10_000,
    note: "偏被动收益策略，展示池子状态和可分配收益，不走普通清算队列。",
  },
];
