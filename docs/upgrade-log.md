# 升级日志

## 2026-05-13

### 版本发布

- 版本号升级到 `1.0.17`，把客户端定位调整为“只读监控 + 执行入口”，套利、扫描、清算机会发现等重逻辑统一下沉到服务器。
- 首页改为以服务端快照为核心：高频变化数据由服务器定时汇总到缓存，客户端只读取快照，减少用户端点 RPC 并发和打开页面等待时间。
- 首页新增“最新资讯”区域，读取 `news.supermtnode.io` 的策略资讯接口；服务不可用时显示本地兜底内容。
- 首页“清算市场”只展示有实战意义的市场介绍，移除 Aave V3 / Ethereum 红海主执行展示，保留 BNB / Arbitrum / Morpho 等更适合作为实战或模拟推进的方向。
- 清算市场表格优化列宽和相关介绍排版，相关介绍列垂直居中，Morpho Base 文案精简为 canary 候选提示。
- 清算控制台左侧改为钱包资产、执行市场、启动/暂停和监控器；终端日志改为连接节点、执行模式、钱包状态、入队和等待清算的干净流程，不再把客户端当作扫描器。
- 清算控制台右侧改为展示服务器策略快照：数据由对应策略市场的服务器接口开放给客户端查询，客户端只读展示，按间隔更新。
- 监控器恢复打字轮播效果，展示执行市场、排队状态、策略状态、钱包 gas/USDC/USDT、当前排队清算状态和最佳粗净利；Gas 显示限制到小数点后 4 位。
- 执行市场下拉只接入服务器已部署、预检通过、可排队执行的市场，避免把未部署或仍在维护的市场暴露为可执行项。
- 节点监控中 Base、Polygon 进入维护状态，立即同步不再检查这两条链；发布资讯中同步说明 Base / Polygon 正在维护。
- 通用设置增加链图标辅助识别，并将 `SUPERMTNODE_APP_TOKEN` 放到钱包私钥后面，便于从 SuperMT Node 端点列表复制后配置。
- 闪电贷专题、清算专题改为只读服务端快照/缓存数据，不再要求每个客户端自行拉取重数据源；移除本地索引和重复侧栏入口。

### 服务端与接口

- 新增新闻服务部署能力，`https://news.supermtnode.io` 提供资讯列表接口，首页默认读取最新 5 条。
- 引入服务端定时刷新思路：服务器每隔约 5 分钟主动刷新闪电贷、清算、Morpho、首页聚合等快照并写入缓存，客户端按 60 秒左右轻量轮询最新快照。
- 新增/完善清算排队服务器与队列接口，客户端启动时先进入队列，只有服务端返回可执行时才允许进入执行流程。
- 新增 BSC 长尾扫描与模拟相关入口，用于后续在服务器侧承载候选发现、模拟层、可还款资产、可拿抵押品、退出路径和净利润估算。

## 2026-05-12

### 版本发布

- 版本号升级到 `1.0.14`，用于让绿色版和 Windows 用户明确识别 GitHub 上的新版本。
- 补充绿色版更新说明：如果本地不是 git 工作区，必须重新下载或替换最新代码包，不能只依赖页面版本提示。
- 版本号升级到 `1.0.15`，修复低 RPS ETH RPC endpoint 在读取钱包资产时容易触发 `RPS limit exceeded` 的问题。
- 版本号升级到 `1.0.16`，继续修复清算扫描阶段读取 Aave reserve 配置和用户数据时触发低 RPS endpoint 限速的问题。
- 通用设置进入输入框或下拉控件后会立即进入草稿保护状态，后台定时刷新不再覆盖用户尚未保存的输入内容。
- 明确 `.env` 为权威配置文件：启动时 `.env` 最后加载，同名配置以 `.env` 为准，设置页也只保存到 `.env`。

### 通用设置

- 设置页“显示/隐藏”私钥和 RPC 后会在当前页面重绘期间保持状态；重新进入系统时默认隐藏。
- 资金模式和语言下拉框改为自绘样式，避免使用系统原生下拉菜单。
- 设置页每次进入默认隐藏敏感配置；右上角按钮改为显示当前状态，隐藏时显示“隐藏”，明文时显示“显示”。
- 点击保存后立即显示全屏遮罩、转动圆圈和“正在保存中”，保存完成后弹出“已经保存！”。
- 交易所设置页移除“套利交易所列表”输入，只保留交易所 API 公钥 / 私钥配置。
- 页面底部版权栏改为固定在工作区底部，页面滚动时保持可见，并为内容区预留底部空间避免遮挡。
- 清算控制台移除“本轮首选目标 / 等待候选 / 执行闸门”状态卡片。
- 清算控制台钱包资产表的链图标调整为 19px，降低表格视觉占用同时保持可识别。
- 修复清算控制台“执行市场”选择后几秒变空的问题：非闪电贷控制台页面不再同步闪电贷表单，执行市场回填和自绘下拉同步时都会校验当前值，确保选中哪个就显示哪个。
- 清算控制台钱包资产表增加鼠标悬停底色，方便识别当前行。
- 清算控制台启动真实清算前新增执行预检：先连接所选链 RPC 并读取最新区块，再校验当前链钱包 gas、广播模式和执行合约状态；终端文案区分“扫描清算机会”和“正在执行清算交易”。
- 新增公共清算候选池接口 `/api/public-liquidation-feed`，支持 `PUBLIC_LIQUIDATION_FEED_URL` 以及按链拆分的 `PUBLIC_LIQUIDATION_FEED_ETHEREUM_URL`、`PUBLIC_LIQUIDATION_FEED_BNB_URL`、`PUBLIC_LIQUIDATION_FEED_ARBITRUM_URL`、`PUBLIC_LIQUIDATION_FEED_POLYGON_URL`。控制台定时读取服务器侧候选池并合并到右侧列表，用于后续由 ARB / BNB 等专业 RPC 服务器统一扫描，再按用户队列分配执行机会。
- 新增清算执行队列桥接接口 `/api/liquidation-queue/status` 和 `/api/liquidation-queue/event`：客户端会根据当前链钱包 gas、SuperMT Node endpoint 状态与剩余请求数判断是否可入队；队列服务配置后会同步用户位置和执行结果，便于服务端按“成功后排到队尾、过期限额退出队列”的规则轮转 30 个用户。
- 钱包资产读取默认改为静态 USDC / USDT 合约地址，不再为了显示余额先读取 Aave `getPoolDataProvider()` 和 reserve metadata；同时对 RPC RPS 超限增加延迟重试，降低个别低限额 ETH endpoint 显示 `--` 的概率。
- 清算控制台的钱包资产读取固定为快速路径：只读原生 gas、USDC `balanceOf`、USDT `balanceOf`，不再使用 Aave reserve metadata，也不再受 `DASHBOARD_WALLET_USE_AAVE_RESERVES` 影响。
- 清算扫描的 Aave `getReserveConfigurationData`、`getAssetPrice`、`getUserReserveData`、`getUserAccountData` 等合约读取改为更保守的顺序/低并发读取，并对 `RPS limit exceeded`、`429`、rate limit 错误自动等待重试。
- 修正 BNB Chain 的 USDC / USDT 余额小数位配置为 18 位，并确保静态 token 配置覆盖 Aave reserve metadata，避免显示成异常大的稳定币金额；Arbitrum / Ethereum / Polygon 继续按 6 位稳定币小数位读取。
- 修正 Arbitrum USDT 静态合约地址，避免 `viem` 因地址不合法拒绝读取后显示 `--`。
- 新增独立清算排队服务器 `npm run queue:server`：按 `chain + market` 为用户钱包维护执行队列，合格用户登记入队，第一位获得执行权，执行结果上报后轮转到队尾，不合格或 RPC 限额耗尽用户自动退出队列；服务支持 `/status`、`/event` 以及 `/api/admin/liquidation-queue/status`、`/api/admin/liquidation-queue/event` 路径，并通过 JSON 文件持久化队列状态。
- 清算排队服务器新增 `LIQUIDATION_QUEUE_ALLOWED_CHAINS`，用于在 BNB / ARB 等 RPC 节点服务器上按链独立部署，防止 BNB 节点接收 Arbitrum 队列请求或不同链混排。
- 客户端清算控制台新增按链队列地址选择：`LIQUIDATION_QUEUE_ARBITRUM_API_BASE_URL` 默认指向 `https://arb.rpc.supermtnode.io/api/admin/liquidation-queue`，`LIQUIDATION_QUEUE_BNB_API_BASE_URL` 默认指向 `https://bsc.rpc.supermtnode.io/api/admin/liquidation-queue`；选择 ARB / BNB 执行市场时自动进入对应 RPC 节点队列。
- 启动清算器前会检查服务器队列动作，只有 `action: execute` 才允许启动；如果返回 `wait_turn`，终端显示当前排队位置并停止本次启动，避免多个用户同时抢同一个市场。
- 清算执行结果上报队列时补充当前钱包地址，服务器可以准确把执行完成的用户轮转到队尾。

### RPC 用量

- 已验证 `https://rpc.supermtnode.io/eth/rpc_6b1a4b25b8544660b8c0b362bf498ca3` 当前 `eth_blockNumber` 请求可用。
- 当前 RPC 响应没有返回 rate-limit / remaining 相关 header；RPC 用量改为读取 `https://supermtnode.io/app` 同源接口，需要配置 `SUPERMTNODE_APP_TOKEN` 后按 endpoint slug 查询 `request_count/request_limit`。
- 明确 RPC 配置规则：每个用户必须使用自己的 SuperMT Node endpoint，不能共用同一个 `ETHEREUM_RPC_URL`；否则后台按 endpoint slug 合并统计用量和限额，可能导致部分用户加载失败。

## 2026-05-11

### 授权页体验优化

- 授权页标题改为“授权码登录”，并居中显示。
- 新增“保存授权码”选项，勾选后会保存在当前浏览器本地，下次打开自动填入。
- 移除多余的“授权码”和“状态提示”文字，只保留左侧状态内容。
- 默认状态使用白色，只有输入为空、格式错误或授权失败时才显示错误红色。
- 授权码格式按 `SMT-XXXX-XXXX-XXXX-XXXX` 校验，不在界面暴露真实示例授权码。
- 常见授权失败信息改为中文状态，例如授权码不存在、授权码已失效、请输入正确的授权码、授权服务不可用。
- 轻量整理授权页前端脚本，减少重复 DOM 和 `localStorage` 操作，并补充缺失元素保护。

### 清算控制台资产与 RPC 用量

- 控制台资产区从单项轮播改为五链表格，分开显示 ETH、BNB、Base、ARB、Polygon 的 gas、USDC、USDT 余额。
- 后端从用户配置的私钥派生钱包地址并读取资产，不在前端传输私钥。
- 钱包资产表链名称改为链图标展示，并隐藏重复的钱包地址列。
- Gas 余额统一显示到小数点后 4 位，RPC 列显示已用量和限额。
- 钱包资产区右上角改为“刷新”按钮，点击后重新加载钱包资产和 RPC 用量。
- 清算控制台执行终端和候选结果面板改为固定高度，日志和候选列表在面板内部滚动。
- Base 资产读取接入用户配置的 `BASE_RPC_URL`，并使用 Base 上的 USDC/USDT 合约地址读取余额。
- 新增 `/api/rpc/usage` 接口，按 `.env` / `.env.local` 中的链 RPC URL 到 SuperMT Node 的 `rpc_endpoints` 中匹配 endpoint slug，并读取 `request_count/request_limit`。
- 控制台 RPC 用量不再请求 QuickNode 用量接口，也不使用本地进程计数，统一读取 SuperMT Node 自有后台数据。
- 启动清算器时，后端会先读取五链钱包快照并推送到控制台，终端同步输出各链钱包地址、gas、USDC、USDT 状态。

### 策略广场

- 侧边栏新增 `src/img/ai.svg` 策略广场入口，位置在查询/交易图谱图标下方、设置入口上方。
- 新增“策略广场”页面，用于后续承载分类策略，当前先按清算策略、闪电贷组合、跨市场价差、隔离市场分组展示。
- 页面增加执行状态和策略准入面板，便于后续接入真实策略状态、资金门槛、RPC 要求和风控参数。

### 页面底部

- 恢复 dashboard 底部版权栏显示，内容不足一屏时版权栏固定显示在工作区底部。

### 升级说明

- 本次没有升级依赖。
- 继续使用现有 `PRIVATE_KEY`、`ETHEREUM_RPC_URL`、`BNB_RPC_URL`、`BASE_RPC_URL`、`ARBITRUM_RPC_URL`、`POLYGON_RPC_URL`。
- RPC 用量读取需要配置 `SUPERMTNODE_APP_TOKEN`；`SUPERMTNODE_API_BASE_URL` 默认是 `https://supermtnode.io`。
- 本次没有修改授权服务接口。
- 更新后重新启动 dashboard 即可生效。
