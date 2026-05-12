# 升级日志

## 2026-05-12

### 版本发布

- 版本号升级到 `1.0.14`，用于让绿色版和 Windows 用户明确识别 GitHub 上的新版本。
- 补充绿色版更新说明：如果本地不是 git 工作区，必须重新下载或替换最新代码包，不能只依赖页面版本提示。
- 版本号升级到 `1.0.15`，修复低 RPS ETH RPC endpoint 在读取钱包资产时容易触发 `RPS limit exceeded` 的问题。

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

### RPC 用量

- 已验证 `https://rpc.supermtnode.io/eth/rpc_6b1a4b25b8544660b8c0b362bf498ca3` 当前 `eth_blockNumber` 请求可用。
- 当前 RPC 响应没有返回 rate-limit / remaining 相关 header；本地也未配置 SuperMT Node 管理后台凭证，无法读取后台 `request_count/request_limit`，需要配置 `SUPERMTNODE_ADMIN_TOKEN` 或账号密码后再查询准确限额。
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
- RPC 用量读取需要配置 `SUPERMTNODE_ADMIN_TOKEN`，或配置 `SUPERMTNODE_ADMIN_USERNAME` / `SUPERMTNODE_ADMIN_PASSWORD`；`SUPERMTNODE_API_BASE_URL` 默认是 `https://supermtnode.io`。
- 本次没有修改授权服务接口。
- 更新后重新启动 dashboard 即可生效。
