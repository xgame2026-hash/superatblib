<template>
  <section class="market-page">
    <header class="market-toolbar">
      <div class="market-title-group">
        <span class="product-mark" aria-hidden="true"><img :src="polymarketIconUrl" alt="" /></span>
        <div>
          <div class="title-line"><h2>Polymarket</h2><span class="mode-badge live">OFFICIAL API</span></div>
          <p>官方市场数据 · 仅显示仍在接受订单且尚未到期的市场</p>
        </div>
      </div>
      <div class="toolbar-actions">
        <span v-if="snapshot" class="sync-state"><i></i>{{ formatDateTime(snapshot.fetchedAt) }} · {{ snapshot.latencyMs }}ms</span>
        <button class="outline-button" type="button" :disabled="loading" @click="loadMarkets()">{{ loading ? "加载中…" : "↻ 刷新官方数据" }}</button>
      </div>
    </header>

    <div v-if="error" class="source-error"><strong>Polymarket 数据暂不可用</strong><span>{{ error }}</span><button type="button" @click="loadMarkets()">重试</button></div>

    <div class="stat-grid">
      <article class="stat-card"><span>已载入市场</span><strong>{{ snapshot ? snapshot.count : "--" }}</strong><small class="neutral">通过有效期与接单状态校验</small></article>
      <article class="stat-card"><span>钱包 USDT</span><strong>{{ vaultStatus ? formatToken(vaultStatus.wallet.usdtBalance) : "--" }}</strong><small class="neutral">BSC 主网实时余额</small></article>
      <article class="stat-card"><span>可提取本金</span><strong>{{ vaultStatus ? formatToken(vaultStatus.member.availablePrincipal) : "--" }}</strong><small class="neutral">未进入运行周期的本金</small></article>
      <article class="stat-card"><span>运行中本金</span><strong>{{ vaultStatus ? formatToken(vaultStatus.member.lockedPrincipal) : "--" }}</strong><small :class="vaultStatus?.member.lockedPrincipal !== '0.0' ? 'cycle-running' : 'neutral'">{{ lockedPrincipalNote }}</small></article>
      <article class="stat-card compute-card">
        <span>算力</span>
        <strong>{{ powerStatus ? formatToken(powerStatus.power.balance) : "--" }}</strong>
        <button class="stat-card-action" type="button" @click="openPowerPurchase">立即充值算力</button>
      </article>
      <article class="stat-card managed-ai-card">
        <span>AI 托管</span>
        <strong>Aigo2智能体</strong>
      </article>
      <article class="stat-card earnings-card">
        <span>我的收益</span>
        <strong>{{ vaultStatus ? `${formatToken(vaultStatus.member.lifetimeRewardReceived)} USDT` : "--" }}</strong>
      </article>
    </div>

    <el-dialog v-model="powerDialogVisible" class="power-dialog" width="min(760px, calc(100vw - 28px))" :close-on-click-modal="!powerSubmitting">
      <template #header>
        <div class="power-dialog-heading">
          <span>POLYMARKET COMPUTE POWER</span>
          <h3>充值算力</h3>
          <p>固定套餐价格：每 1000 万算力 50 美金</p>
        </div>
      </template>

      <div v-if="powerError" class="vault-alert error power-alert"><strong>算力状态读取失败</strong><span>{{ powerError }}</span></div>
      <div v-else-if="powerStatus && !powerStatus.wallet.isMember" class="vault-alert warning power-alert"><strong>需要会员身份</strong><span>请先存入 USDT 成为 Polymarket 会员，再充值算力。</span></div>

      <div class="power-summary">
        <article><span>当前算力</span><strong>{{ powerStatus ? formatToken(powerStatus.power.balance) : "--" }}</strong></article>
        <article><span>购买份数</span><div class="package-stepper"><button type="button" :disabled="powerPackages <= 1" @click="powerPackages--">−</button><input v-model.number="powerPackages" type="number" min="1" max="999" step="1" /><button type="button" :disabled="powerPackages >= 999" @click="powerPackages++">＋</button></div></article>
        <article><span>获得算力</span><strong class="positive">{{ formatToken(powerAmountText) }}</strong></article>
        <article><span>价值</span><strong>{{ formatToken(powerPriceText) }} USDT</strong></article>
      </div>

      <div class="payment-methods" role="radiogroup" aria-label="算力支付方式">
        <button type="button" :class="{ active: powerPaymentMethod === 'balance' }" @click="powerPaymentMethod = 'balance'">
          <span class="method-icon balance">余</span>
          <span><b>余额支付</b><small>余额数量</small><strong>{{ powerStatus ? formatToken(powerStatus.payments.balance.available) : "--" }} USDT</strong></span>
          <i>{{ powerPaymentMethod === "balance" ? "✓" : "" }}</i>
        </button>
        <button type="button" :class="{ active: powerPaymentMethod === 'mt' }" @click="powerPaymentMethod = 'mt'">
          <span class="method-icon mt">MT</span>
          <span><b>MT 支付</b><small>钱包余额</small><strong>{{ powerStatus ? formatToken(powerStatus.payments.mt.available) : "--" }} MT</strong></span>
          <i>{{ powerPaymentMethod === "mt" ? "✓" : "" }}</i>
        </button>
        <button type="button" :class="{ active: powerPaymentMethod === 'usdt' }" @click="powerPaymentMethod = 'usdt'">
          <span class="method-icon usdt">₮</span>
          <span><b>USDT 支付</b><small>钱包余额</small><strong>{{ powerStatus ? formatToken(powerStatus.payments.usdt.available) : "--" }} USDT</strong></span>
          <i>{{ powerPaymentMethod === "usdt" ? "✓" : "" }}</i>
        </button>
      </div>

      <div class="power-payment-review">
        <span>本次支付</span>
        <strong>{{ powerPaymentText }}</strong>
        <small>授权额度不足时，系统会先完成授权，确认后自动购买。</small>
      </div>

      <button class="primary-button power-purchase-button" type="button" :disabled="powerPurchaseDisabled" @click="submitPowerPurchase">{{ powerPurchaseButtonLabel }}</button>
    </el-dialog>

    <section class="vault-panel">
      <div class="vault-heading">
        <div>
          <span class="section-kicker">BSC MAINNET · POLYMARKET VAULT</span>
          <h3>USDT 资金账户</h3>
          <p v-if="!vaultStatus?.wallet.configured">读取本地设置中的执行钱包，不会向浏览器发送私钥。</p>
        </div>
        <div class="vault-state">
          <span :class="contractStateClass"><i></i>{{ contractStateLabel }}</span>
          <button class="outline-button" type="button" :disabled="vaultLoading" @click="loadVaultStatus()">{{ vaultLoading ? "读取中…" : "↻ 刷新状态" }}</button>
        </div>
      </div>

      <div v-if="vaultError" class="vault-alert error"><strong>合约状态读取失败</strong><span>{{ vaultError }}</span></div>
      <div v-else-if="vaultStatus && !vaultStatus.wallet.configured" class="vault-alert warning"><strong>尚未配置执行钱包</strong><span>请先在设置中保存 PRIVATE_KEY 和 BNB_RPC_URL。</span></div>
      <div v-else-if="vaultStatus?.member.blacklisted" class="vault-alert error"><strong>当前钱包已受限</strong><span>合约禁止该钱包存入和提取。</span></div>

      <div class="vault-workspace">
        <article class="vault-action-card">
          <header><div><span>DEPOSIT</span><h4>存入 USDT</h4></div><small>钱包余额 {{ vaultStatus ? formatToken(vaultStatus.wallet.usdtBalance) : "--" }} USDT</small></header>
          <label class="vault-amount-field">
            <input v-model="depositAmount" inputmode="decimal" autocomplete="off" placeholder="0.0" @input="depositAmount = normalizeAmount(depositAmount)" />
            <b>USDT</b>
            <button type="button" @click="setMaximumDeposit">最大</button>
          </label>
          <div class="vault-action-meta">
            <span>授权额度</span><strong>{{ vaultStatus ? `${formatToken(vaultStatus.wallet.allowance)} USDT` : "--" }}</strong>
          </div>
          <button class="primary-button vault-submit" type="button" :disabled="depositDisabled" @click="submitDeposit">{{ depositButtonLabel }}</button>
        </article>

        <article class="vault-action-card">
          <header><div><span>WITHDRAW</span><h4>提取本金</h4></div><small>可提 {{ vaultStatus ? formatToken(vaultStatus.member.availablePrincipal) : "--" }} USDT</small></header>
          <label class="vault-amount-field">
            <input v-model="withdrawAmount" inputmode="decimal" autocomplete="off" placeholder="0.0" @input="withdrawAmount = normalizeAmount(withdrawAmount)" />
            <b>USDT</b>
            <button type="button" @click="setMaximumWithdraw">最大</button>
          </label>
          <div class="vault-action-meta">
            <span>周期锁定</span><strong>{{ vaultStatus ? `${formatToken(vaultStatus.member.lockedPrincipal)} USDT` : "--" }}</strong>
          </div>
          <button class="primary-button vault-submit withdraw" type="button" :disabled="withdrawDisabled" @click="submitWithdraw">{{ withdrawButtonLabel }}</button>
        </article>

        <article class="vault-status-card">
          <header><div><span>STATUS</span><h4>账户与周期状态</h4></div><small v-if="vaultStatus">区块 #{{ vaultStatus.blockNumber.toLocaleString() }}</small></header>
          <dl>
            <div><dt>当前周期</dt><dd>{{ cycleLabel }}</dd></div>
            <div><dt>累计存入</dt><dd>{{ vaultStatus ? formatToken(vaultStatus.member.lifetimeDeposited) : "--" }} USDT</dd></div>
            <div><dt>累计收益率</dt><dd class="positive">{{ vaultStatus ? formatReturn(vaultStatus.member.totalReturnBps) : "--" }}</dd></div>
            <div><dt>提取限制</dt><dd>{{ restrictionLabel }}</dd></div>
            <div><dt>合约会员</dt><dd>{{ vaultStatus ? vaultStatus.vault.memberCount : "--" }} 人</dd></div>
          </dl>
          <p class="vault-status-note">{{ cycleStatusNote }}</p>
        </article>
      </div>

      <article v-if="vaultStatus?.cycle" class="cycle-participation-panel">
        <header>
          <div><span>CAPITAL CYCLE</span><h4>周期本金管理</h4><p>周期 #{{ vaultStatus.vault.currentCycleId }} · {{ CYCLE_LABELS[vaultStatus.cycle.status] || "未知状态" }}</p></div>
          <div class="cycle-capital-summary">
            <span><small>本人本周期本金</small><strong>{{ formatToken(vaultStatus.member.cyclePrincipal) }} USDT</strong></span>
            <span><small>周期已跨链</small><strong>{{ formatToken(vaultStatus.cycle.outboundAmount) }} USDT</strong></span>
            <span><small>周期后退出</small><strong>{{ formatToken(vaultStatus.member.exitAfterCycle) }} USDT</strong></span>
          </div>
        </header>
        <div class="cycle-participation-actions">
          <label class="vault-amount-field">
            <input v-model="cycleAmount" inputmode="decimal" autocomplete="off" placeholder="0.0" @input="cycleAmount = normalizeAmount(cycleAmount)" />
            <b>USDT</b>
            <button type="button" @click="setMaximumCycleAmount(vaultStatus.cycle.status===1?'available':'cycle')">最大</button>
          </label>
          <template v-if="vaultStatus.cycle.status===1">
            <button class="primary-button" type="button" :disabled="cycleActionDisabled||compareAmounts(cycleAmount,vaultStatus.member.availablePrincipal)>0" @click="submitCycleAction('join')">{{vaultSubmitting==='join'?'正在加入…':'加入当前周期'}}</button>
            <button class="outline-button" type="button" :disabled="cycleActionDisabled||compareAmounts(cycleAmount,vaultStatus.member.cyclePrincipal)>0" @click="submitCycleAction('leave')">{{vaultSubmitting==='leave'?'正在退出…':'退出周期募集'}}</button>
          </template>
          <button v-else-if="[2,3,4].includes(vaultStatus.cycle.status)" class="outline-button cycle-exit-button" type="button" :disabled="cycleActionDisabled" @click="submitCycleAction('request-exit')">{{vaultSubmitting==='request-exit'?'正在登记…':'周期结束后退出'}}</button>
          <span class="cycle-action-note">{{vaultStatus.cycle.status===1?'募集期内可自由加入或退出；募集结束后本金锁定。':[2,3,4].includes(vaultStatus.cycle.status)?'运行期间不能提取本金，可预先登记周期结束后的退出金额。':'当前周期已结束，等待管理员释放本金。'}}</span>
        </div>
      </article>
    </section>

    <div class="workspace-grid">
      <section class="market-panel opportunity-panel">
        <div class="panel-header">
          <div><span class="section-kicker">LIVE MARKET DISCOVERY</span><h3>当前市场</h3></div>
          <span class="result-count">{{ filteredMarkets.length }} 个市场</span>
        </div>
        <div class="filter-bar">
          <label class="search-box"><span>⌕</span><input v-model.trim="search" type="search" placeholder="搜索真实市场" /></label>
          <div class="category-tabs" role="tablist" aria-label="市场分类">
            <button v-for="category in categories" :key="category" type="button" :class="{ active: activeCategory === category }" @click="activeCategory = category">{{ category }}</button>
          </div>
          <label class="edge-filter"><span>最大价差</span><select v-model.number="maximumSpread"><option :value="1">全部</option><option :value="0.05">≤ 5%</option><option :value="0.02">≤ 2%</option><option :value="0.01">≤ 1%</option></select></label>
        </div>

        <div v-if="loading && !snapshot" class="empty-state">正在从 Polymarket 官方接口读取市场…</div>
        <div v-else class="market-list">
          <button v-for="market in filteredMarkets" :key="market.id" class="market-row" :class="{ selected: selectedMarket?.id === market.id }" type="button" @click="selectedMarketId = market.id">
            <span class="event-icon" :class="{ 'has-photo': market.image }"><img v-if="market.image" :src="market.image" alt="" /><span v-else>P</span></span>
            <span class="market-copy"><small>{{ market.category }} · 截止 {{ formatEndDate(market.endDate) }}</small><strong>{{ market.question }}</strong><span>流动性 {{ formatUsd(market.liquidity) }} · 24h {{ formatUsd(market.volume24hr) }} · 更新 {{ relativeTime(market.updatedAt) }}</span></span>
            <span class="probability-cell"><small>YES 概率</small><strong>{{ formatCents(market.yesPrice) }}</strong><span v-if="market.oneDayPriceChange !== null" :class="market.oneDayPriceChange >= 0 ? 'positive' : 'negative'">{{ formatChange(market.oneDayPriceChange) }}</span><span v-else>--</span></span>
            <span class="price-pair"><span class="yes-price"><small>YES</small><strong>{{ formatCents(market.yesPrice) }}</strong></span><span class="no-price"><small>NO</small><strong>{{ formatCents(market.noPrice) }}</strong></span></span>
            <span class="edge-cell"><small>盘口价差</small><strong :class="market.spread !== null && market.spread <= .02 ? 'positive' : ''">{{ market.spread === null ? "--" : formatPercent(market.spread) }}</strong></span>
          </button>
          <div v-if="!filteredMarkets.length" class="empty-state">{{ snapshot ? "没有符合当前筛选条件的有效市场" : "等待官方数据" }}</div>
        </div>
      </section>

      <aside class="market-panel detail-panel">
        <div class="panel-header detail-heading"><div><span class="section-kicker">OFFICIAL MARKET DATA</span><h3>市场详情</h3></div><span class="risk-badge">只读</span></div>
        <template v-if="selectedMarket">
          <div class="selected-event"><span class="event-icon large" :class="{ 'has-photo': selectedMarket.image }"><img v-if="selectedMarket.image" :src="selectedMarket.image" alt="" /><span v-else>P</span></span><div><small>{{ selectedMarket.category }}</small><strong>{{ selectedMarket.question }}</strong></div></div>
          <div class="probability-chart"><div class="chart-caption"><span>官方隐含概率</span><strong>{{ formatCents(selectedMarket.yesPrice) }}</strong></div><div class="probability-track"><span class="yes-segment" :style="{ width: `${(selectedMarket.yesPrice || 0) * 100}%` }"></span></div><div class="chart-legend"><span><i class="yes-dot"></i> YES {{ formatCents(selectedMarket.yesPrice) }}</span><span><i class="no-dot"></i> NO {{ formatCents(selectedMarket.noPrice) }}</span></div></div>
          <dl class="ticket-summary market-facts">
            <div><dt>最佳买价 / 卖价</dt><dd>{{ formatCents(selectedMarket.bestBid) }} / {{ formatCents(selectedMarket.bestAsk) }}</dd></div>
            <div><dt>盘口价差</dt><dd>{{ selectedMarket.spread === null ? "--" : formatPercent(selectedMarket.spread) }}</dd></div>
            <div><dt>24h 成交量</dt><dd>{{ formatUsd(selectedMarket.volume24hr) }}</dd></div>
            <div><dt>可用流动性</dt><dd>{{ formatUsd(selectedMarket.liquidity) }}</dd></div>
            <div><dt>最小订单</dt><dd>{{ selectedMarket.minOrderSize ?? "--" }} USDC</dd></div>
            <div><dt>官方更新时间</dt><dd>{{ formatDateTime(selectedMarket.updatedAt) }}</dd></div>
          </dl>
          <div class="risk-note"><span>i</span><p>市场数据来自 Polymarket Gamma API；USDT 资金操作通过已部署的 BSC 主网 Polymarket 合约执行。</p></div>
          <a class="primary-button market-link" :href="marketUrl(selectedMarket)" target="_blank" rel="noopener noreferrer">在 Polymarket 查看 ↗</a>
        </template>
        <div v-else class="empty-state">选择一个有效市场查看官方数据</div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import polymarketIconUrl from "../../img/polymarket.svg";

type Market = { id:string; question:string; slug:string; eventSlug:string; category:string; image:string; endDate:string; updatedAt:string; liquidity:number; volume:number; volume24hr:number; yesPrice:number|null; noPrice:number|null; bestBid:number|null; bestAsk:number|null; spread:number|null; oneDayPriceChange:number|null; acceptingOrders:boolean; minOrderSize:number|null; minTickSize:number|null };
type Snapshot = { ok:boolean; source:string; sourceLabel:string; fetchedAt:string; latencyMs:number; count:number; totals:{liquidity:number;volume24hr:number}; markets:Market[] };
type VaultCycle = { status:number; monthId:number; fundingEndTime:number; startTime:number; expectedEndTime:number; settlementDeadline:number; participantCount:number; totalPrincipal:string; outboundAmount:string; returnedAmount:string; netProfit:string; rewardBudget:string; distributedReward:string };
type PowerPaymentMethod = "balance"|"mt"|"usdt";
type PowerStatus = {
  chainId:number;blockNumber:number;updatedAt:string;
  contracts:{power:string;superMtPower:string;usdt:string;mt:string};
  wallet:{configured:boolean;address:string;bnbBalance:string;isMember:boolean;blacklisted:boolean};
  power:{balance:string;totalSupply:string;totalAllocated:string;availableSupply:string;packagePower:string;packagePriceUsdt:string;purchasesPaused:boolean;migrationActive:boolean;migrationFinalized:boolean};
  payments:{
    balance:{available:string;allowance:string};
    mt:{available:string;allowance:string;packageQuote:string;priceUsdtPerMt:string};
    usdt:{available:string;allowance:string};
  };
};
type VaultStatus = {
  chainId:number;
  blockNumber:number;
  updatedAt:string;
  contracts:{vault:string;usdt:string;owner:string};
  wallet:{configured:boolean;address:string;bnbBalance:string;usdtBalance:string;allowance:string};
  member:{
    availablePrincipal:string;lockedPrincipal:string;pendingWithdrawal:string;lifetimeDeposited:string;lifetimePrincipalWithdrawn:string;
    lifetimeRewardReceived:string;cyclePrincipal:string;exitAfterCycle:string;totalReturnBps:number;blacklisted:boolean;
    restriction:{restricted:boolean;rolling24HourLimit:string;windowWithdrawn:string;lifetimeLimit:string;lifetimeWithdrawn:string};
  };
  vault:{
    depositsPaused:boolean;withdrawalsPaused:boolean;rewardsPaused:boolean;bridgePaused:boolean;cyclesPaused:boolean;
    migrationActive:boolean;migrationFinalized:boolean;currentCycleId:number;memberCount:number;
    totalPrincipalLiability:string;totalLockedPrincipal:string;lifetimeRewardsPaid:string;
  };
  cycle:VaultCycle|null;
};

const AUTH_CODE_KEY = "superarb-auth-code-v1.6.5";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.5";
const CYCLE_LABELS = ["无周期", "募资中", "已锁定", "运行中", "结算中", "可领取", "已关闭", "已取消", "已逾期"];

const snapshot = ref<Snapshot | null>(null);
const loading = ref(false);
const error = ref("");
const search = ref("");
const activeCategory = ref("全部");
const maximumSpread = ref(1);
const selectedMarketId = ref("");
const vaultStatus = ref<VaultStatus|null>(null);
const powerStatus = ref<PowerStatus|null>(null);
const vaultLoading = ref(false);
const vaultError = ref("");
const powerLoading = ref(false);
const powerError = ref("");
const depositAmount = ref("");
const withdrawAmount = ref("");
const cycleAmount = ref("");
const vaultSubmitting = ref<""|"approve"|"deposit"|"withdraw"|"join"|"leave"|"request-exit">("");
const powerDialogVisible = ref(false);
const powerPackages = ref(1);
const powerPaymentMethod = ref<PowerPaymentMethod>("balance");
const powerSubmitting = ref(false);
let refreshTimer = 0;
let vaultRefreshTimer = 0;

const categories = computed(() => ["全部", ...Array.from(new Set((snapshot.value?.markets || []).map((market) => market.category))).slice(0, 5)]);
const filteredMarkets = computed(() => {
  const keyword = search.value.toLowerCase();
  return (snapshot.value?.markets || []).filter((market) => {
    const categoryMatch = activeCategory.value === "全部" || market.category === activeCategory.value;
    const textMatch = !keyword || `${market.question} ${market.category}`.toLowerCase().includes(keyword);
    const spreadMatch = market.spread === null || market.spread <= maximumSpread.value;
    return categoryMatch && textMatch && spreadMatch;
  });
});
const selectedMarket = computed(() => (snapshot.value?.markets || []).find((market) => market.id === selectedMarketId.value) || filteredMarkets.value[0] || null);
const contractStateLabel = computed(() => {
  if (!vaultStatus.value) return vaultLoading.value ? "状态读取中" : "等待状态";
  if (vaultStatus.value.vault.migrationActive || vaultStatus.value.vault.migrationFinalized) return "迁移冻结";
  if (vaultStatus.value.member.blacklisted) return "钱包受限";
  if (vaultStatus.value.vault.depositsPaused && vaultStatus.value.vault.withdrawalsPaused) return "存取暂停";
  if (vaultStatus.value.vault.depositsPaused || vaultStatus.value.vault.withdrawalsPaused || vaultStatus.value.vault.cyclesPaused) return "部分功能暂停";
  return "合约运行中";
});
const contractStateClass = computed(() => {
  if (!vaultStatus.value) return "state-pill waiting";
  if (vaultStatus.value.vault.migrationActive || vaultStatus.value.vault.migrationFinalized || vaultStatus.value.member.blacklisted) return "state-pill blocked";
  if (vaultStatus.value.vault.depositsPaused || vaultStatus.value.vault.withdrawalsPaused) return "state-pill warning";
  return "state-pill active";
});
const lockedPrincipalNote = computed(() => {
  if (!vaultStatus.value) return "等待合约状态";
  return decimalGreaterThanZero(vaultStatus.value.member.lockedPrincipal) ? "周期运行中，暂不可提" : "当前没有锁定本金";
});
const cycleLabel = computed(() => {
  const cycle = vaultStatus.value?.cycle;
  if (!cycle) return "暂无";
  return `#${vaultStatus.value?.vault.currentCycleId} · ${CYCLE_LABELS[cycle.status] || "未知"}`;
});
const cycleStatusNote = computed(() => {
  const status = vaultStatus.value;
  if (!status) return "正在读取 BSC 主网合约状态。";
  if (status.vault.migrationActive || status.vault.migrationFinalized) return "合约处于迁移冻结状态，存入和提取均不可执行。";
  if (status.member.blacklisted) return "当前钱包已被列入黑名单，不能存入或提取。";
  if (decimalGreaterThanZero(status.member.lockedPrincipal)) return "运行中本金将在周期结算并释放后转为可提取本金。";
  return "当前可用本金可以随时提取；进入运行周期后将按合约规则锁定。";
});
const restrictionLabel = computed(() => {
  const restriction = vaultStatus.value?.member.restriction;
  if (!restriction?.restricted) return "无限制";
  const daily = decimalGreaterThanZero(restriction.rolling24HourLimit) ? `${formatToken(restriction.rolling24HourLimit)} / 24h` : "无日限额";
  const lifetime = decimalGreaterThanZero(restriction.lifetimeLimit) ? `累计 ${formatToken(restriction.lifetimeLimit)}` : "无总限额";
  return `${daily} · ${lifetime}`;
});
const needsDepositApproval = computed(() => Boolean(
  vaultStatus.value && isPositiveAmount(depositAmount.value) && compareAmounts(depositAmount.value, vaultStatus.value.wallet.allowance) > 0,
));
const depositDisabled = computed(() => {
  const status = vaultStatus.value;
  if (!status || vaultLoading.value || Boolean(vaultSubmitting.value) || !status.wallet.configured || !isPositiveAmount(depositAmount.value)) return true;
  if (status.vault.depositsPaused || status.vault.migrationActive || status.vault.migrationFinalized || status.member.blacklisted) return true;
  return compareAmounts(depositAmount.value, status.wallet.usdtBalance) > 0 || !decimalGreaterThanZero(status.wallet.bnbBalance);
});
const withdrawDisabled = computed(() => {
  const status = vaultStatus.value;
  if (!status || vaultLoading.value || Boolean(vaultSubmitting.value) || !status.wallet.configured || !isPositiveAmount(withdrawAmount.value)) return true;
  if (status.vault.withdrawalsPaused || status.vault.migrationActive || status.vault.migrationFinalized || status.member.blacklisted) return true;
  return compareAmounts(withdrawAmount.value, status.member.availablePrincipal) > 0 || !decimalGreaterThanZero(status.wallet.bnbBalance);
});
const cycleActionDisabled = computed(() => {
  const status = vaultStatus.value;
  if (!status || vaultLoading.value || Boolean(vaultSubmitting.value) || !status.wallet.configured || !isPositiveAmount(cycleAmount.value)) return true;
  if (status.vault.cyclesPaused || status.vault.migrationActive || status.vault.migrationFinalized || status.member.blacklisted || !decimalGreaterThanZero(status.wallet.bnbBalance)) return true;
  const cycleStatus = status.cycle?.status || 0;
  if (cycleStatus === 1) return compareAmounts(cycleAmount.value, status.member.availablePrincipal) > 0 && compareAmounts(cycleAmount.value, status.member.cyclePrincipal) > 0;
  if ([2,3,4].includes(cycleStatus)) return compareAmounts(cycleAmount.value, status.member.cyclePrincipal) > 0;
  return true;
});
const depositButtonLabel = computed(() => {
  if (vaultSubmitting.value === "deposit") return needsDepositApproval.value ? "正在授权并存入…" : "正在存入…";
  if (!vaultStatus.value?.wallet.configured) return "请先配置钱包";
  if (vaultStatus.value.vault.migrationActive || vaultStatus.value.vault.migrationFinalized) return "合约迁移冻结";
  if (vaultStatus.value.member.blacklisted) return "当前钱包已受限";
  if (vaultStatus.value.vault.depositsPaused) return "存入已暂停";
  if (!isPositiveAmount(depositAmount.value)) return "输入存入金额";
  if (vaultStatus.value && compareAmounts(depositAmount.value, vaultStatus.value.wallet.usdtBalance) > 0) return "USDT 余额不足";
  return "存入 Polymarket 合约";
});
const withdrawButtonLabel = computed(() => {
  if (vaultSubmitting.value === "withdraw") return "正在提取…";
  if (!vaultStatus.value?.wallet.configured) return "请先配置钱包";
  if (vaultStatus.value.vault.migrationActive || vaultStatus.value.vault.migrationFinalized) return "合约迁移冻结";
  if (vaultStatus.value.member.blacklisted) return "当前钱包已受限";
  if (vaultStatus.value.vault.withdrawalsPaused) return "提取已暂停";
  if (!isPositiveAmount(withdrawAmount.value)) return "输入提取金额";
  if (vaultStatus.value && compareAmounts(withdrawAmount.value, vaultStatus.value.member.availablePrincipal) > 0) return "可提取本金不足";
  return "提取到执行钱包";
});
const normalizedPowerPackages = computed(() => Math.min(999, Math.max(1, Math.trunc(Number(powerPackages.value) || 1))));
const powerAmountText = computed(() => multiplyDecimal(powerStatus.value?.power.packagePower || "10000000", normalizedPowerPackages.value));
const powerPriceText = computed(() => multiplyDecimal(powerStatus.value?.power.packagePriceUsdt || "50", normalizedPowerPackages.value));
const powerMtText = computed(() => multiplyDecimal(powerStatus.value?.payments.mt.packageQuote || "0", normalizedPowerPackages.value));
const powerPaymentText = computed(() => {
  if (powerPaymentMethod.value === "mt") return `${formatToken(powerMtText.value)} MT`;
  return `${formatToken(powerPriceText.value)} USDT${powerPaymentMethod.value === "balance" ? "（余额）" : ""}`;
});
const powerAvailableBalance = computed(() => {
  if (!powerStatus.value) return "0";
  if (powerPaymentMethod.value === "balance") return powerStatus.value.payments.balance.available;
  if (powerPaymentMethod.value === "mt") return powerStatus.value.payments.mt.available;
  return powerStatus.value.payments.usdt.available;
});
const powerRequiredBalance = computed(() => powerPaymentMethod.value === "mt" ? powerMtText.value : powerPriceText.value);
const powerPurchaseDisabled = computed(() => {
  const status = powerStatus.value;
  if (!status || powerLoading.value || powerSubmitting.value || !status.wallet.configured || !status.wallet.isMember || status.wallet.blacklisted) return true;
  if (status.power.purchasesPaused || status.power.migrationActive || status.power.migrationFinalized || !decimalGreaterThanZero(status.wallet.bnbBalance)) return true;
  if (compareAmounts(powerAmountText.value, status.power.availableSupply) > 0) return true;
  return compareAmounts(powerRequiredBalance.value, powerAvailableBalance.value) > 0;
});
const powerPurchaseButtonLabel = computed(() => {
  if (powerSubmitting.value) return "正在授权并购买…";
  if (powerLoading.value) return "正在读取算力状态…";
  if (!powerStatus.value?.wallet.configured) return "请先配置钱包";
  if (!powerStatus.value.wallet.isMember) return "请先存入 USDT 成为会员";
  if (powerStatus.value.wallet.blacklisted) return "当前钱包已受限";
  if (powerStatus.value.power.purchasesPaused) return "算力购买已暂停";
  if (powerStatus.value.power.migrationActive || powerStatus.value.power.migrationFinalized) return "算力合约不可购买";
  if (compareAmounts(powerRequiredBalance.value, powerAvailableBalance.value) > 0) return `${powerPaymentMethod.value === "mt" ? "MT" : powerPaymentMethod.value === "usdt" ? "USDT" : "余额"}不足`;
  return `确认购买 ${normalizedPowerPackages.value} 份算力`;
});

onMounted(() => {
  void loadMarkets();
  void loadVaultStatus();
  void loadPowerStatus();
  refreshTimer = window.setInterval(() => void loadMarkets(true), 30_000);
  vaultRefreshTimer = window.setInterval(() => {
    void loadVaultStatus(true);
    void loadPowerStatus(true);
  }, 15_000);
});
onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
  if (vaultRefreshTimer) window.clearInterval(vaultRefreshTimer);
});

async function loadMarkets(silent = false): Promise<void> {
  if (!silent) loading.value = true;
  try {
    const response = await fetch("/api/polymarket/markets?limit=100", { cache: "no-store", headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null) as Snapshot | { error?: string } | null;
    if (!response.ok || !payload || !("markets" in payload)) throw new Error(payload && "error" in payload ? payload.error : `HTTP ${response.status}`);
    snapshot.value = payload;
    error.value = "";
    if (!selectedMarketId.value || !payload.markets.some((item) => item.id === selectedMarketId.value)) selectedMarketId.value = payload.markets[0]?.id || "";
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "无法读取 Polymarket 官方数据";
    snapshot.value = null;
  } finally { loading.value = false; }
}

function openPowerPurchase(): void {
  powerDialogVisible.value = true;
  void loadPowerStatus();
}

async function loadVaultStatus(silent = false):Promise<void> {
  if (!silent) vaultLoading.value = true;
  try {
    vaultStatus.value = await requestVaultJson<VaultStatus>("/api/polymarket/vault/status");
    vaultError.value = "";
  } catch (reason) {
    vaultError.value = reason instanceof Error ? reason.message : "无法读取 BSC 主网合约";
  } finally {
    if (!silent) vaultLoading.value = false;
  }
}

async function loadPowerStatus(silent = false):Promise<void> {
  if (!silent) powerLoading.value = true;
  try {
    powerStatus.value = await requestVaultJson<PowerStatus>("/api/polymarket/power/status");
    powerError.value = "";
  } catch (reason) {
    powerError.value = reason instanceof Error ? reason.message : "无法读取算力合约";
  } finally {
    if (!silent) powerLoading.value = false;
  }
}

async function submitPowerPurchase():Promise<void> {
  if (powerPurchaseDisabled.value || !powerStatus.value) return;
  const packages = normalizedPowerPackages.value;
  const powerAmount = formatToken(powerAmountText.value);
  try {
    await ElMessageBox.confirm(
      `使用${powerPaymentMethod.value === "balance" ? "余额" : powerPaymentMethod.value.toUpperCase()}支付 ${powerPaymentText.value}，购买 ${powerAmount} 算力？授权不足时将先授权再购买。`,
      "确认充值算力",
      { type:"warning", confirmButtonText:"确认购买", cancelButtonText:"取消" },
    );
  } catch { return; }
  powerSubmitting.value = true;
  try {
    const result = await requestVaultJson<{txHash:string;approvalTxHash?:string}>("/api/polymarket/power/purchase", {
      method:"POST",
      body:JSON.stringify({method:powerPaymentMethod.value,packages}),
    });
    ElMessage.success(result.approvalTxHash ? `授权并购买已确认：${shortHash(result.txHash)}` : `算力购买已确认：${shortHash(result.txHash)}`);
    await Promise.all([loadPowerStatus(true), loadVaultStatus(true)]);
  } catch (reason) {
    ElMessage.error(errorText(reason));
  } finally {
    powerSubmitting.value = false;
  }
}

async function submitDeposit():Promise<void> {
  if (depositDisabled.value || !vaultStatus.value) return;
  const amount = requestAmount(depositAmount.value);
  try {
    const transactionNote = needsDepositApproval.value
      ? "当前授权额度不足，系统将先完成 USDT 授权，确认后自动继续存入；共需两笔 BSC 主网交易。"
      : "当前授权额度足够，将直接发送 BSC 主网存入交易。";
    await ElMessageBox.confirm(`存入 ${amount} USDT 到 Polymarket 合约？${transactionNote}`, "确认授权并存入", {
      type:"warning", confirmButtonText:"确认存入", cancelButtonText:"取消",
    });
  } catch { return; }
  vaultSubmitting.value = "deposit";
  try {
    const result = await requestVaultJson<{txHash:string;approvalTxHash?:string}>("/api/polymarket/vault/deposit", {method:"POST",body:JSON.stringify({amount})});
    ElMessage.success(result.approvalTxHash
      ? `授权并存入已确认：${shortHash(result.txHash)}`
      : `存入已确认：${shortHash(result.txHash)}`);
    depositAmount.value = "";
    await loadVaultStatus();
  } catch (reason) {
    ElMessage.error(errorText(reason));
  } finally { vaultSubmitting.value = ""; }
}

async function submitWithdraw():Promise<void> {
  if (withdrawDisabled.value || !vaultStatus.value) return;
  const amount = requestAmount(withdrawAmount.value);
  try {
    await ElMessageBox.confirm(`从 Polymarket 合约提取 ${amount} USDT 到执行钱包？`, "确认提取", {
      type:"warning", confirmButtonText:"确认提取", cancelButtonText:"取消",
    });
  } catch { return; }
  vaultSubmitting.value = "withdraw";
  try {
    const result = await requestVaultJson<{txHash:string}>("/api/polymarket/vault/withdraw", {method:"POST",body:JSON.stringify({amount})});
    ElMessage.success(`提取已确认：${shortHash(result.txHash)}`);
    withdrawAmount.value = "";
    await loadVaultStatus();
  } catch (reason) {
    ElMessage.error(errorText(reason));
  } finally { vaultSubmitting.value = ""; }
}

async function submitCycleAction(action:"join"|"leave"|"request-exit"):Promise<void> {
  if (cycleActionDisabled.value || !vaultStatus.value?.cycle) return;
  const amount = requestAmount(cycleAmount.value);
  const labels = action === "join"
    ? { title:"确认加入周期", action:"加入", path:"join-cycle" }
    : action === "leave"
      ? { title:"确认退出募集", action:"退出募集", path:"leave-cycle" }
      : { title:"确认周期后退出", action:"登记周期结束后退出", path:"request-exit" };
  try {
    await ElMessageBox.confirm(`${labels.action} ${amount} USDT 本金，周期 #${vaultStatus.value.vault.currentCycleId}？`, labels.title, {
      type:"warning", confirmButtonText:"确认执行", cancelButtonText:"取消",
    });
  } catch { return; }
  vaultSubmitting.value = action;
  try {
    const result = await requestVaultJson<{txHash:string}>(`/api/polymarket/vault/${labels.path}`, { method:"POST", body:JSON.stringify({amount}) });
    ElMessage.success(`${labels.action}已确认：${shortHash(result.txHash)}`);
    cycleAmount.value = "";
    await loadVaultStatus();
  } catch (reason) {
    ElMessage.error(errorText(reason));
  } finally { vaultSubmitting.value = ""; }
}

async function requestVaultJson<T>(url:string, init:RequestInit={}):Promise<T> {
  const authCode = sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim();
  const headers = new Headers(init.headers);
  headers.set("accept","application/json");
  if (init.body) headers.set("content-type","application/json");
  if (authCode) headers.set("x-supermtnode-auth-code",authCode);
  const response = await fetch(url,{...init,headers});
  const payload = await response.json().catch(() => ({})) as Record<string,unknown>;
  if (!response.ok || payload.ok === false) throw new Error(String(payload.error || payload.message || `HTTP ${response.status}`));
  return payload as T;
}

function setMaximumDeposit():void { depositAmount.value = trimAmount(vaultStatus.value?.wallet.usdtBalance || ""); }
function setMaximumWithdraw():void { withdrawAmount.value = trimAmount(vaultStatus.value?.member.availablePrincipal || ""); }
function setMaximumCycleAmount(source:"available"|"cycle"):void {
  cycleAmount.value = trimAmount(source === "available" ? vaultStatus.value?.member.availablePrincipal || "" : vaultStatus.value?.member.cyclePrincipal || "");
}
function normalizeAmount(value:string):string {
  const source=String(value||"").replace(/,/g,"").replace(/[^\d.]/g,"");
  const [integer="",...parts]=source.split(".");
  const fraction=parts.join("").slice(0,18);
  const whole=integer.replace(/^0+(?=\d)/,"");
  return parts.length ? `${whole||"0"}.${fraction}` : whole;
}
function requestAmount(value:string):string { return value.endsWith(".") ? value.slice(0,-1) : value; }
function isPositiveAmount(value:string):boolean { return /^\d+(?:\.\d{0,18})?$/.test(value) && compareAmounts(value,"0")>0; }
function decimalGreaterThanZero(value:string):boolean { return compareAmounts(value,"0")>0; }
function compareAmounts(left:string,right:string):number {
  const units=(value:string)=>{const normalized=String(value||"0").replace(/,/g,"").trim();if(!/^\d+(?:\.\d+)?$/.test(normalized))return 0n;const [whole,fraction=""]=normalized.split(".");return BigInt(whole||"0")*10n**18n+BigInt(fraction.slice(0,18).padEnd(18,"0"));};
  const a=units(left),b=units(right);return a===b?0:a>b?1:-1;
}
function trimAmount(value:string):string { return String(value||"").replace(/(\.\d*?[1-9])0+$|\.0+$/,"$1"); }
function multiplyDecimal(value:string,multiplier:number):string {
  const normalized=String(value||"0").trim();
  if(!/^\d+(?:\.\d+)?$/.test(normalized))return "0";
  const [whole,fraction=""]=normalized.split(".");
  const scale=10n**BigInt(fraction.length);
  const units=BigInt(whole||"0")*scale+BigInt(fraction||"0");
  const product=units*BigInt(Math.max(0,Math.trunc(multiplier)));
  const productWhole=product/scale;
  const productFraction=(product%scale).toString().padStart(fraction.length,"0").replace(/0+$/,"");
  return `${productWhole}${productFraction?`.${productFraction}`:""}`;
}
function formatToken(value:string):string {
  const normalized=trimAmount(value);
  if(!/^\d+(?:\.\d+)?$/.test(normalized))return "--";
  const [whole,fraction=""]=normalized.split(".");
  const decimals=fraction.slice(0,4).replace(/0+$/,"");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g,",")}${decimals?`.${decimals}`:""}`;
}
function formatReturn(bps:number):string { return `${(Number(bps||0)/100).toFixed(2)}%`; }
function shortHash(value:string):string { return /^0x[\da-f]{64}$/i.test(value) ? `${value.slice(0,10)}…${value.slice(-6)}` : value||"--"; }
function errorText(reason:unknown):string { return reason instanceof Error ? reason.message : "交易失败，请稍后重试"; }

function formatUsd(value:number):string { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:2}).format(value || 0); }
function formatCents(value:number|null):string { return value === null || !Number.isFinite(value) ? "--" : `${(value*100).toFixed(value < .01 ? 1 : 0)}¢`; }
function formatPercent(value:number):string { return `${(value*100).toFixed(2)}%`; }
function formatChange(value:number):string { return `${value >= 0 ? "+" : ""}${(value*100).toFixed(1)}%`; }
function formatEndDate(value:string):string { const date=new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(date) : "--"; }
function formatDateTime(value:string):string { const date=new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(date) : "--"; }
function relativeTime(value:string):string { const diff=Date.now()-Date.parse(value); if(!Number.isFinite(diff)) return "--"; if(diff<60_000)return "刚刚"; if(diff<3_600_000)return `${Math.floor(diff/60_000)} 分钟前`; if(diff<86_400_000)return `${Math.floor(diff/3_600_000)} 小时前`; return `${Math.floor(diff/86_400_000)} 天前`; }
function marketUrl(market:Market):string { const slug=market.eventSlug || market.slug; return `https://polymarket.com/event/${encodeURIComponent(slug)}`; }
</script>

<style scoped src="./PolymarketView.css"></style>
