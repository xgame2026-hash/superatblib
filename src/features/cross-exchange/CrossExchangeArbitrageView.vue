<template>
  <section class="arb-page">
    <header class="arb-toolbar">
      <div class="arb-title"><span class="arb-mark" aria-hidden="true">⇄</span><div><div class="arb-title-line"><h2>跨交易所套利</h2><span class="demo-label official">PUBLIC ORDER BOOKS</span></div><p>官方公开现货盘口 · 按可成交深度计算，不使用模拟报价</p></div></div>
      <div class="scanner-control"><span class="scanner-status" :class="{ paused: !scanning || Boolean(error) }"><i></i>{{ error ? "数据异常" : scanning ? "自动刷新" : "已暂停" }}</span><span v-if="snapshot" class="scan-time">{{ formatTime(snapshot.fetchedAt) }} · {{ snapshot.booksReceived }}/{{ snapshot.expectedBooks }} books</span><button class="scan-button" type="button" @click="toggleScanner">{{ scanning ? "暂停" : "开始" }}</button><button class="scan-button" type="button" :disabled="loading" @click="loadSnapshot()">{{ loading ? "刷新中" : "立即刷新" }}</button></div>
    </header>

    <div v-if="error" class="arb-source-error"><strong>交易所盘口暂不可用</strong><span>{{ error }}</span><button type="button" @click="loadSnapshot()">重试</button></div>
    <div v-else-if="snapshot && snapshot.errors.length" class="arb-source-warning">部分盘口读取失败：{{ snapshot.expectedBooks - snapshot.booksReceived }} / {{ snapshot.expectedBooks }}。失败的数据源不会参与机会计算。</div>

    <div class="arb-stats">
      <article><span>监控交易对</span><strong>{{ snapshot?.pairs.length ?? "--" }}</strong><small>{{ snapshot ? snapshot.pairs.join(" · ") : "等待官方数据" }}</small></article>
      <article><span>正毛价差</span><strong class="profit-text">{{ filteredOpportunities.length }}</strong><small>达到 {{ (minimumGrossBps / 100).toFixed(2) }}% 阈值</small></article>
      <article><span>最佳毛价差</span><strong :class="bestOpportunity ? 'profit-text' : ''">{{ bestOpportunity ? formatBps(bestOpportunity.grossBps) : "--" }}</strong><small>{{ bestOpportunity ? `${bestOpportunity.buyExchange} → ${bestOpportunity.sellExchange}` : "当前无机会" }}</small></article>
      <article><span>在线数据源</span><strong>{{ onlineExchangeCount }} / {{ snapshot?.exchanges.length ?? "--" }}</strong><small>{{ snapshot?.feeModel.configured ? "账户费率已配置" : "账户费率未配置" }}</small></article>
    </div>

    <div class="arb-layout">
      <main class="arb-main-panel">
        <div class="arb-panel-header"><div><span>OFFICIAL ORDER BOOK SCANNER</span><h3>可成交价差矩阵</h3></div><div class="table-filters"><label><span>交易对</span><select v-model="pairFilter"><option>全部</option><option v-for="pair in snapshot?.pairs || []" :key="pair">{{ pair }}</option></select></label><label><span>最低毛价差</span><select v-model.number="minimumGrossBps"><option :value="0">全部</option><option :value="10">0.10%</option><option :value="20">0.20%</option><option :value="50">0.50%</option></select></label></div></div>
        <div class="exchange-health"><span v-for="exchange in snapshot?.exchanges || []" :key="exchange.name" :class="{ degraded: exchange.status !== 'online', offline: exchange.status === 'offline' }"><i :style="{ background: exchangeColor(exchange.name) }">{{ exchange.name[0] }}</i>{{ exchange.name }}<b></b><small>{{ exchange.latencyMs === null ? "离线" : `${exchange.latencyMs}ms` }}</small></span></div>

        <div class="opportunity-table" role="table" aria-label="真实盘口价差">
          <div class="table-row table-head" role="row"><span>交易对</span><span>买入</span><span></span><span>卖出</span><span>毛价差</span><span>手续费</span><span>净收益</span><span>盘口容量</span><span>操作</span></div>
          <div v-for="item in filteredOpportunities" :key="item.id" class="table-row" :class="{ selected: selected?.id === item.id }" role="row" @click="selectedId = item.id">
            <span class="pair-cell"><i :style="{ '--coin': pairColor(item.pair) }">{{ pairSymbol(item.pair) }}</i><b>{{ item.pair }}</b><small>现货 · {{ formatUsd(item.notional) }}</small></span>
            <span class="venue-cell"><b>{{ item.buyExchange }}</b><small>{{ formatPrice(item.buyAveragePrice) }}</small></span><span class="route-arrow" aria-hidden="true">→</span><span class="venue-cell"><b>{{ item.sellExchange }}</b><small>{{ formatPrice(item.sellAveragePrice) }}</small></span>
            <span><b>{{ formatBps(item.grossBps) }}</b><small>{{ formatUsd(item.grossProfit) }}</small></span><span class="cost-cell"><b>{{ item.feeConfigured ? `-${formatUsd(item.feeCost || 0)}` : "待配置" }}</b><small>{{ item.feeConfigured ? "账户 taker fee" : "未假设费率" }}</small></span><span class="net-cell"><b>{{ item.netBps === null ? "--" : formatBps(item.netBps) }}</b><small>{{ item.netProfit === null ? "无法计算" : formatUsd(item.netProfit) }}</small></span><span><b>{{ formatUsd(item.executableCapacityQuote) }}</b><small>已读取档位</small></span><span><button class="row-action" type="button" @click.stop="selectedId = item.id">详情</button></span>
          </div>
          <div v-if="loading && !snapshot" class="arb-empty">正在并发读取交易所官方盘口…</div><div v-else-if="!filteredOpportunities.length" class="arb-empty">当前真实盘口没有达到筛选阈值的正毛价差</div>
        </div>
        <footer class="table-footer"><span><i></i> 数据源：Binance、OKX、Bybit、Coinbase 官方公开 order book</span><span>同一轮快照 · 本金 {{ formatUsd(snapshot?.notional || capital) }}</span></footer>
      </main>

      <aside class="execution-panel">
        <div class="execution-heading"><div><span>PRE-TRADE VALIDATION</span><h3>机会核验</h3></div><span class="readonly-tag">只读</span></div>
        <template v-if="selected">
          <div class="selected-route"><div class="route-pair"><i :style="{ '--coin': pairColor(selected.pair) }">{{ pairSymbol(selected.pair) }}</i><div><strong>{{ selected.pair }}</strong><small>真实盘口加权均价</small></div></div><div class="route-venues"><span><small>BUY</small><b>{{ selected.buyExchange }}</b></span><i>→</i><span><small>SELL</small><b>{{ selected.sellExchange }}</b></span></div></div>
          <label class="capital-input"><span>计算本金</span><div><input v-model.number="capital" type="number" min="100" max="100000" step="100" /><b>USDT</b></div></label><div class="quick-capital"><button v-for="size in [1000,5000,10000]" :key="size" type="button" @click="applyCapital(size)">{{ size/1000 }}K</button><button type="button" @click="loadSnapshot()">应用</button></div>
          <dl class="execution-metrics"><div><dt>买入加权均价</dt><dd>{{ formatPrice(selected.buyAveragePrice) }}</dd></div><div><dt>卖出加权均价</dt><dd>{{ formatPrice(selected.sellAveragePrice) }}</dd></div><div><dt>毛收益</dt><dd class="profit-text">+{{ formatUsd(selected.grossProfit) }}</dd></div><div><dt>账户手续费</dt><dd :class="selected.feeConfigured ? 'cost-text' : ''">{{ selected.feeConfigured ? `-${formatUsd(selected.feeCost || 0)}` : "未配置" }}</dd></div><div class="net-profit"><dt>预估净收益</dt><dd>{{ selected.netProfit === null ? "--" : formatUsd(selected.netProfit) }}</dd></div></dl>
          <div class="risk-checks"><div><span class="check">✓</span><p><b>盘口深度已校验</b><small>本轮可执行容量 {{ formatUsd(selected.executableCapacityQuote) }}</small></p></div><div><span :class="selected.feeConfigured ? 'check' : 'warn'">{{ selected.feeConfigured ? "✓" : "!" }}</span><p><b>账户费率</b><small>{{ selected.feeConfigured ? "已按环境配置计入" : "未配置，不展示净收益" }}</small></p></div><div><span class="warn">!</span><p><b>仅行情核验</b><small>未校验余额、API 权限、下单延迟与库存</small></p></div></div>
          <button class="simulate-button" type="button" :disabled="loading" @click="loadSnapshot()">按当前本金重新读取盘口</button><p class="execution-disclaimer">页面不提交订单。真实执行还需账户余额、费率等级、限频、双腿原子性和失败对冲控制。</p>
        </template><div v-else class="arb-empty">当前没有可核验的真实价差</div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
type ExchangeState={name:string;status:"online"|"partial"|"offline";pairCount:number;latencyMs:number|null;latestSourceTime:string};
type Opportunity={id:string;pair:string;buyExchange:string;sellExchange:string;buyAveragePrice:number;sellAveragePrice:number;grossBps:number;grossProfit:number;feeConfigured:boolean;feeCost:number|null;netProfit:number|null;netBps:number|null;notional:number;baseQuantity:number;executableCapacityQuote:number;buyReceivedAt:string;sellReceivedAt:string;maxLatencyMs:number};
type Snapshot={ok:boolean;source:string;fetchedAt:string;notional:number;pairs:string[];feeModel:{configured:boolean;unit:string;values:Record<string,number|null>;note:string};exchanges:ExchangeState[];booksReceived:number;expectedBooks:number;errors:string[];opportunities:Opportunity[]};
const snapshot=ref<Snapshot|null>(null); const loading=ref(false); const error=ref(""); const scanning=ref(true); const pairFilter=ref("全部"); const minimumGrossBps=ref(10); const selectedId=ref(""); const capital=ref(5000); let timer=0;
const filteredOpportunities=computed(()=>(snapshot.value?.opportunities||[]).filter(item=>(pairFilter.value==="全部"||item.pair===pairFilter.value)&&item.grossBps>=minimumGrossBps.value));
const selected=computed(()=>filteredOpportunities.value.find(item=>item.id===selectedId.value)||filteredOpportunities.value[0]||null); const bestOpportunity=computed(()=>filteredOpportunities.value[0]||null); const onlineExchangeCount=computed(()=>snapshot.value?.exchanges.filter(item=>item.status==="online").length??"--");
onMounted(()=>{void loadSnapshot();timer=window.setInterval(()=>{if(scanning.value)void loadSnapshot(true)},10_000)});onBeforeUnmount(()=>{if(timer)window.clearInterval(timer)});
async function loadSnapshot(silent=false):Promise<void>{if(!silent)loading.value=true;try{const response=await fetch(`/api/cross-exchange/opportunities?notional=${encodeURIComponent(String(capital.value))}`,{cache:"no-store",headers:{accept:"application/json"}});const payload=await response.json().catch(()=>null) as Snapshot|{error?:string}|null;if(!response.ok||!payload||!("opportunities" in payload))throw new Error(payload&&"error" in payload?payload.error:`HTTP ${response.status}`);snapshot.value=payload;error.value="";if(!selectedId.value||!payload.opportunities.some(item=>item.id===selectedId.value))selectedId.value=payload.opportunities[0]?.id||""}catch(reason){error.value=reason instanceof Error?reason.message:"无法读取交易所官方盘口";snapshot.value=null}finally{loading.value=false}}
function toggleScanner():void{scanning.value=!scanning.value;if(scanning.value)void loadSnapshot()} function applyCapital(value:number):void{capital.value=value;void loadSnapshot()}
function formatUsd(value:number):string{return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:Math.abs(value)>=10000?"compact":"standard",maximumFractionDigits:2}).format(value||0)} function formatPrice(value:number):string{return `$${value.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:value<100?4:2})}`} function formatBps(value:number):string{return `${value>=0?"+":""}${(value/100).toFixed(3)}%`} function formatTime(value:string):string{const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(date):"--"}
function pairSymbol(pair:string):string{return pair.startsWith("BTC")?"₿":pair.startsWith("ETH")?"Ξ":"S"} function pairColor(pair:string):string{return pair.startsWith("BTC")?"#f59e0b":pair.startsWith("ETH")?"#8b5cf6":"#41f0aa"} function exchangeColor(name:string):string{return ({Binance:"#f3ba2f",OKX:"#d9d9e3",Bybit:"#f7a600",Coinbase:"#3b82f6"} as Record<string,string>)[name]||"#8b5cf6"}
</script>
<style scoped src="./CrossExchangeArbitrageView.css"></style>
<style scoped>
.demo-label.official { border-color: rgba(65,240,170,.3); background: rgba(65,240,170,.07); color: #84efc0; }
.exchange-health .offline b { background: #ff759d; }
.exchange-health .offline { opacity: .65; }
.arb-source-error, .arb-source-warning { display: flex; align-items: center; gap: 12px; border-radius: 10px; padding: 11px 14px; font-size: 10px; }
.arb-source-error { border: 1px solid rgba(248,113,113,.3); background: rgba(127,29,29,.12); color: #fecaca; }
.arb-source-error span { flex: 1; }
.arb-source-error button { border: 1px solid rgba(248,113,113,.3); border-radius: 7px; background: transparent; color: #fecaca; cursor: pointer; padding: 5px 9px; }
.arb-source-warning { border: 1px solid rgba(251,191,36,.22); background: rgba(120,53,15,.1); color: #eacb87; }
</style>
