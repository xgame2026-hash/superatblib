# Aave V3 Liquidation Scanner

第一步先做扫描，不直接执行清算。

当前仓库这版做了三件事：

- 校验 `RPC_URL` 实际连到哪条链
- 校验 `ADDRESS_PROVIDER` 在该链上是否真的有合约代码
- 从 Aave V3 Pool 事件回溯用户，再用 `getUserAccountData()` 找出低健康因子地址
- 内置 `BNB / Arbitrum / Polygon` 三条链的 Aave V3 官方配置
- 新增目标分析器，输出 `debtAsset / collateralAsset / 粗略毛利`
- 已为 `Aave V4` 预留协议适配层，不改现有 `V3` 生产链路

## Tests

当前默认 smoke 入口已经接上 `typecheck + dashboard` 装配校验：

```bash
npm test
```

如果你只想单独检查 dashboard 装配层：

```bash
npm run test:dashboard
```

如果你只想跑默认 smoke 套件，也可以显式执行：

```bash
npm run test:smoke
```

这两项当前会校验：

- 最终 `DASHBOARD_HTML` 是否包含关键页面、modal、runtime 片段
- `page/body/runtime` 三层 assembly 的职责边界和顺序
- `html/runtime/page/body/document/style/shell` 这些入口文件不会重新长回大杂烩

## 协议路线

当前线上逻辑仍然是 `Aave V3`：

- `scan / analyze / prepare / execute` 走的都是 `V3` 的 pool / reserve / liquidationCall
- `BNB / Arbitrum / Polygon` 这三条链当前也都挂到 `Aave V3` 协议描述

但仓库现在已经开始按双协议结构准备：

- 市场解析会显式返回当前协议，例如 `Aave V3`
- `scan / analyze / prepare` 的 JSON 输出会带上 `protocol`
- 新增 `protocol:report`，专门说明当前生效协议、未来 `V4` 的占位能力和需要替换的部分

查看当前协议准备状态：

```bash
npm run protocol:report
npm run protocol:report -- --chain polygon --json
```

当前为 `V4` 预留但尚未落地的重点：

- `Target Health Factor` 风格的 `debtToCover` 计算
- 动态 `liquidation bonus` 建模
- 统一闪电贷来源适配，不把流动性来源写死成当前 `V3 pool`

## 当前结论

你给的 RPC 是 BNB Chain:

- `eth_chainId = 0x38`
- 也就是 `56`

你给的 `ADDRESS_PROVIDER = 0xa97684...` 在 BNB Chain 上没有代码，所以这不是可用的 BNB Aave V3 配置。

BNB Chain 上 Aave V3 官方地址是：

- `POOL_ADDRESSES_PROVIDER = 0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D`
- `POOL = 0x6807dc923806fE8Fd134338EABCA509979a7e0cB`

来源：

- [Aave address book](https://raw.githubusercontent.com/aave-dao/aave-address-book/main/src/ts/AaveV3BNB.ts)

Arbitrum / Polygon 也已经内置官方地址：

- [AaveV3Arbitrum.ts](https://raw.githubusercontent.com/aave-dao/aave-address-book/main/src/ts/AaveV3Arbitrum.ts)
- [AaveV3Polygon.ts](https://raw.githubusercontent.com/aave-dao/aave-address-book/main/src/ts/AaveV3Polygon.ts)

## Run

默认用公开 `BNB` RPC 跑扫描：

```bash
npm run scan
```

指定链并使用 QuickNode RPC：

```bash
BNB_RPC_URL="https://your-bnb-quicknode" npm run scan -- --chain bnb
ARBITRUM_RPC_URL="https://your-arbitrum-quicknode" npm run scan -- --chain arbitrum
POLYGON_RPC_URL="https://your-polygon-quicknode" npm run scan -- --chain polygon
```

你也可以继续直接传 `RPC_URL`：

```bash
RPC_URL="https://your-rpc" npm run scan -- --chain arbitrum
```

调整扫描窗口和阈值：

```bash
npm run scan -- --chain arbitrum --lookbackBlocks 300000 --threshold 1.03 --limit 30
```

输出 JSON：

```bash
npm run scan -- --chain polygon --json
```

如果 `--chain` 和 RPC 实际连到的链不一致，脚本会直接报错，不会静默扫错链。

## Analyze

对风险地址做进一步分析：

```bash
ARBITRUM_RPC_URL="https://your-arbitrum-quicknode" npm run analyze -- --chain arbitrum --lookbackBlocks 30000 --limit 5
POLYGON_RPC_URL="https://your-polygon-quicknode" npm run analyze -- --chain polygon --lookbackBlocks 30000 --limit 5
```

输出 JSON：

```bash
npm run analyze -- --chain polygon --json
```

分析器会给出：

- `topDebtAssets`
- `topCollateralAssets`
- `bestPair`
- `grossProfitDisplay`

这里的利润是粗略毛利：

- 已考虑 liquidation bonus 和 protocol fee
- 还没有扣 gas
- 还没有扣 DEX 滑点
- 还没有处理闪电贷成本

## Prepare

生成可直接用于交易层的 `approve + liquidationCall` 参数和 calldata：

```bash
POLYGON_RPC_URL="https://your-polygon-quicknode" npm run prepare -- --chain polygon
ARBITRUM_RPC_URL="https://your-arbitrum-quicknode" npm run prepare -- --chain arbitrum
```

默认只挑当前已可清算的目标。如果你想提前准备观察名单里的目标：

```bash
npm run prepare -- --chain polygon --allowRisky
```

指定用户：

```bash
npm run prepare -- --chain polygon --user 0xYourTarget
```

输出字段包括：

- `approve.token / spender / amount / calldata`
- `liquidationCall.collateralAsset / debtAsset / user / debtToCover / calldata`
- `expectedGrossProfitDisplay`

## Execute

执行层默认只做预检查和模拟，不会发送交易：

```bash
LIQUIDATOR_ADDRESS="0xYourAddress" POLYGON_RPC_URL="https://your-polygon-quicknode" npm run execute -- --chain polygon --lookbackBlocks 30000
```

如果账户已经持有待偿还的债务资产，并且你明确要广播：

```bash
PRIVATE_KEY="0xyourprivatekey" POLYGON_RPC_URL="https://your-polygon-quicknode" npm run execute -- --chain polygon --lookbackBlocks 30000 --broadcast
```

执行层会输出：

- 当前钱包原生币余额
- 债务资产余额
- 当前 allowance
- 利润检查和广播闸门结果
- `approve` 模拟结果
- `liquidationCall` 模拟结果

注意：

- 没有债务资产余额时，`liquidationCall` 不会通过
- 这版还没有闪电贷资金源
- 这版还没有 DEX 平仓和利润兑现

## Self-Funded Contract

如果你决定用“用户自有资金 + 合约执行”，现在仓库里已经有最小合约：

- [SelfFundedAaveV3Liquidator.sol](/Users/powermac/627/xsina2025/developing/Yang/2026job/mt-dapp/liq/contracts/SelfFundedAaveV3Liquidator.sol)

先检查合约能否编译：

```bash
npm run compile:liquidator
```

部署：

```bash
PRIVATE_KEY="0xyourprivatekey" POLYGON_RPC_URL="https://your-polygon-quicknode" npm run deploy:liquidator -- --chain polygon
```

部署后把地址写进环境变量：

```bash
LIQUIDATOR_CONTRACT=0xYourContract
```

然后做合约模式的模拟：

```bash
PRIVATE_KEY="0xyourprivatekey" LIQUIDATOR_CONTRACT="0xYourContract" POLYGON_RPC_URL="https://your-polygon-quicknode" npm run execute:liquidator -- --chain polygon --lookbackBlocks 30000
```

如果 owner 钱包已经持有债务资产，并且明确要广播：

```bash
PRIVATE_KEY="0xyourprivatekey" LIQUIDATOR_CONTRACT="0xYourContract" POLYGON_RPC_URL="https://your-polygon-quicknode" npm run execute:liquidator -- --chain polygon --lookbackBlocks 30000 --broadcast
```

这个合约模式会：

- owner 先把债务资产 `approve` 给合约
- 合约从 owner 拉资金
- 合约调用 Aave `liquidationCall`
- 合约把拿到的抵押品和剩余债务资产退回 owner

如果你已经从聚合器拿到了卖出路径，也可以在清算后立刻卖出抵押品：

```bash
PRIVATE_KEY="0xyourprivatekey" \
LIQUIDATOR_CONTRACT="0xYourContract" \
POLYGON_RPC_URL="https://your-polygon-quicknode" \
SWAP_TARGET="0xRouterOrAggregator" \
SWAP_ALLOWANCE_TARGET="0xActualSpenderIfDifferent" \
OUTPUT_TOKEN="0xOutputToken" \
MIN_OUTPUT_AMOUNT="0" \
SWAP_CALLDATA="0xYourQuoteCalldata" \
npm run execute:liquidator -- --chain polygon --lookbackBlocks 30000
```

如果聚合器把实际 spender 和 calldata 执行地址拆开了，例如 0x allowance-holder 路由，`SWAP_ALLOWANCE_TARGET` 要填真实 spender。

`run:self-funded` 也支持同样的这些参数。

如果你不想手工准备 `SWAP_CALLDATA`，也可以让脚本自动向 OpenOcean 拉报价：

```bash
PRIVATE_KEY="0xyourprivatekey" \
POLYGON_RPC_URL="https://your-polygon-quicknode" \
AUTO_SWAP=1 \
SWAP_SLIPPAGE=1 \
npm run run:self-funded -- --chain polygon --lookbackBlocks 30000
```

默认会在 `debtAsset, USDC, USDT, DAI, WETH, WMATIC/WBNB` 这些候选里自动比价，选择预计净利润最高的输出币。  
当前在 Polygon 实测，这笔 `WBTC` 抵押仓位自动会优先卖到 `USDC`，不是 `EURS`。

如果你想自己指定输出币：

```bash
PRIVATE_KEY="0xyourprivatekey" \
POLYGON_RPC_URL="https://your-polygon-quicknode" \
AUTO_SWAP=1 \
SWAP_OUT_TOKEN="0xOutputToken" \
npm run run:self-funded -- --chain polygon --lookbackBlocks 30000
```

如果你想改默认候选集：

```bash
AUTO_SWAP=1 AUTO_SWAP_SYMBOLS="USDC,USDT,DAI,WETH" npm run run:self-funded -- --chain polygon
```

当前代码结构已经把“清算执行”和“套利/换币路由”拆开维护：

- `src/liquidation/` 负责候选评估、执行闸门、模拟诊断，`src/liquidation/strategies.ts` 负责 market selection 和默认执行参数
- `src/arbitrage/` 负责换币报价、自动选路、套利监控，`src/arbitrage/strategies.ts` 负责套利 token/pair/mode 定义
- `src/self-funded-runner.ts` 只保留清算编排
- `src/dashboard.ts` 的套利流逻辑改为调用 `src/arbitrage/monitor.ts`

执行层现在会在广播前默认做利润闸门：

- 估算 `approve + liquidation + swap` 的 gas
- 按 `GAS_BUFFER_BPS` 给 gas 预留缓冲
- 用 Aave oracle 把 gas 和最小成交额都换算成 base currency
- 只有 `estimatedNetProfit >= MIN_NET_PROFIT` 才允许广播
- 广播后会在回执里输出 `effectiveGasPriceWei` 和 `realizedProfit`

相关环境变量：

- `MIN_NET_PROFIT=0`
- `GAS_BUFFER_BPS=12500`
- `SKIP_PROFIT_CHECK=1` 可以跳过闸门，但不建议
- `AUTO_DEPLOY=1` 或命令行 `--deploy` 可以在缺少合约地址时自动部署

利润分配现在也接进去了，但走的是更稳的 off-chain 分润：

- 清算和换币先把资产回到 owner
- 脚本按实际收到的 `outputToken` 数量，先保留一份“本金等值”
- 只把剩余的 `distributable profit` 按比例转给收款人
- 默认只输出分润计划；只有显式开启 `--distributeProfit` 或 `AUTO_DISTRIBUTE_PROFIT=1` 才会真的发分润转账

配置方式：

- `PROFIT_RECIPIENTS="0xRecipient1,0xRecipient2"`
- `PROFIT_SPLIT_BPS="7000,2000"`

上面的例子表示：

- 70% 的可分利润打给 `Recipient1`
- 20% 的可分利润打给 `Recipient2`
- 剩下 10% 的可分利润留在 owner

执行回执现在会额外输出：

- `profitDistributionPlan`
- `broadcastResult.realizedDistribution`
- `broadcastResult.profitDistributionTxs`

每次执行或模拟还会自动落盘到本地历史文件：

- 默认路径：`.data/execution-history.jsonl`
- 可用 `HISTORY_FILE=/your/path.jsonl` 覆盖

查看最近记录：

```bash
npm run history -- --limit 10
```

启动本地 dashboard：

```bash
npm run dashboard
```

现在脚本会自动读取项目根目录的 `.env` 和 `.env.local`。  
也就是说你把 `PRIVATE_KEY / RPC / LIQUIDATOR_CONTRACT` 写进去后，不用每次再手工 `export`。

可选环境变量：

- `DASHBOARD_HOST=127.0.0.1`
- `DASHBOARD_PORT=4310`

启动后浏览器打开：

```bash
http://127.0.0.1:4310
```

dashboard 当前会展示：

- 最近执行历史
- 最新目标地址和交易对
- 最新预估净利润 / 已实现净利润
- 分润规划和收款人分配
- 原始执行回执 JSON
- 本地控制面板，可直接触发 `scan / analyze / execute:liquidator / run:self-funded`
- 独立套利监控页，复用 `src/arbitrage/monitor.ts`
- 独立清算监控页，复用 `src/liquidation/monitor.ts`

如果你不想通过 dashboard，也可以直接跑独立套利监控：

```bash
PRIVATE_KEY="0xyourprivatekey" \
ETHEREUM_RPC_URL="https://your-ethereum-rpc" \
npm run run:arbitrage -- --market route-arb-ethereum --maxCycles 1
```

可选参数：

- `--market route-arb-ethereum|stable-arb-ethereum|tri-arb-ethereum`
- `--token USDC|WETH|0xTokenAddress`
- `--loopDelayMs 8000`
- `--maxCycles 1`
- `--rpcUrl https://your-ethereum-rpc`

如果你想直接跑独立清算监控，而不是进 dashboard：

```bash
PRIVATE_KEY="0xyourprivatekey" \
ETHEREUM_RPC_URL="https://your-ethereum-rpc" \
npm run run:auto-execute -- --market aave-v3-ethereum --maxCycles 1
```

可选参数：

- `--market aave-v3-ethereum|spark-ethereum|auto-ethereum`
- `--chain ethereum|polygon|arbitrum|bnb`
- `--lookbackBlocks 2000`
- `--hfMax 1.05`
- `--limit 5`
- `--allowRisky`
- `--autoSwap`
- `--broadcast`
- `--minNetProfit 0`
- `--resumeFromBlock ... --resumeChunkStart ... --resumeChunkEnd ... --resumeUserOffset ...`
- `--rpcUrl https://your-rpc`

控制面板说明：

- `RPC URL Override` 可以直接在页面里临时填入，不需要先 `export`
- `PRIVATE_KEY` 这类敏感值仍然只建议走环境变量，不会在页面上暴露
- `Contract Override` 只会覆盖本次点击触发的执行，不会改写你的 `.env`
- dashboard 默认只显示 `broadcast` 历史，不显示 simulation
- 页面里的执行按钮现在要求 `broadcast=true`，否则会直接拒绝

如果你只想拿原始数据，也可以直接访问：

```bash
http://127.0.0.1:4310/api/history?limit=25
```

也可以直接 POST 触发本地脚本：

```bash
curl -X POST http://127.0.0.1:4310/api/run \
  -H 'content-type: application/json' \
  --data '{"action":"scan","chain":"polygon","rpcUrl":"https://your-rpc","lookbackBlocks":5000,"limit":3}'
```

当前限制：

- 只支持 `receiveAToken = false`
- 自动报价当前只接了 OpenOcean

如果你想用单命令跑完整自有资金流程：

```bash
PRIVATE_KEY="0xyourprivatekey" POLYGON_RPC_URL="https://your-polygon-quicknode" npm run run:self-funded -- --chain polygon --lookbackBlocks 30000
```

这个命令会：

- 如果已经有 `LIQUIDATOR_CONTRACT`，直接复用
- 如果没有合约地址，只有在 `--broadcast` 或 `--deploy` 时才会自动部署
- 然后自动做 `approve`/`executeLiquidation` 或 `executeLiquidationAndSwap` 模拟
- 只有显式加 `--broadcast` 才会真的发交易

## 下一步

扫描之后，下一阶段应该按这个顺序往下做：

1. 锁定可清算地址和最优 `debtAsset/collateralAsset`
2. 接入闪电贷或自有资金执行 `liquidationCall`
3. 做滑点、gas、DEX 兑换和利润校验
4. 再做利润分配模块
