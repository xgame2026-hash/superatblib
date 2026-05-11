# 升级日志

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
