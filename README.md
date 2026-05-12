# SuperARB

SuperARB 是一个面向链上机会监控与执行辅助的本地化工作台，聚合多链市场数据、清算观察、闪电贷概览、Morpho Blue 风险面板和执行控制台，帮助用户在同一个界面中完成配置、观察、筛选和操作。

SuperARB 以本地运行方式为主，用户可以自行配置 RPC、资金方式、语言和执行账户。系统启动后会先进行授权校验，并在进入工作台前检查 GitHub 最新版本，确保客户端保持在可用版本。

## 产品定位

SuperARB 适合需要持续观察 DeFi 市场机会的个人用户、研究人员和执行团队。它不是一个公开托管的 SaaS 页面，而是一个运行在用户本地环境中的专业控制台，重点解决以下问题：

- 多链 RPC 与基础运行环境配置分散
- 清算、闪电贷、风险资产等信息需要在多个页面之间切换
- 客户端版本不一致时容易出现数据或执行异常
- 执行相关参数需要和监控界面保持一致
- 普通用户需要更清晰的授权、配置和更新流程

## 核心优势

- **本地运行**：配置文件和私钥保存在本地环境，用户自行控制运行入口。
- **多链支持**：统一维护 Ethereum、BNB Chain、Arbitrum、Base、Polygon 等 RPC。
- **统一看板**：将清算、闪电贷、Morpho 和执行入口集中在同一个工作台。
- **版本保护**：启动时检查 GitHub 最新版本，发现更新后提示用户先更新再进入。
- **授权控制**：进入系统前需要授权码，避免未授权使用。
- **配置简化**：通用设置只保留用户真正需要维护的字段，减少误配置。
- **执行辅助**：支持选择资金方式，并为后续执行流程提供基础配置。

## 主要用途

SuperARB 可用于：

- 查看多链市场状态
- 观察清算相关数据
- 查看闪电贷活动概览
- 跟踪 Morpho Blue 风险面
- 管理本地 RPC 和执行账户
- 在控制台中启动或暂停相关流程
- 通过版本提示保持客户端与 GitHub 最新代码一致

## 基础操作流程

1. 复制配置模板：

```bash
cp .env.example .env
```

Windows:

```bat
copy .env.example .env
```

2. 安装依赖：

```bash
npm install
```

3. 启动工作台：

```bash
npm run dashboard
```

4. 在浏览器中打开本地页面，输入授权码。

5. 进入“系统设置 / 通用设置”，配置：

- `PRIVATE_KEY`
- `ETHEREUM_RPC_URL`
- `BNB_RPC_URL`
- `ARBITRUM_RPC_URL`
- `BASE_RPC_URL`
- `POLYGON_RPC_URL`
- 语言
- 资金方式

6. 保存设置后，返回看板页面查看数据或进入对应控制台。

## 配置说明

默认看板至少需要配置：

```env
ETHEREUM_RPC_URL=
```

每个用户必须使用自己的 SuperMT Node RPC endpoint，不要让多个用户共用同一个
`ETHEREUM_RPC_URL`。SuperMT Node 的 `request_count/request_limit` 按 endpoint
slug 统计；如果 30 个用户共用同一个 `rpc_xxx`，限额会合并计算，部分用户可能会因为
这个共享 endpoint 达到限制而打不开或加载失败。

如需使用其它链，可继续配置：

```env
BNB_RPC_URL=
ARBITRUM_RPC_URL=
BASE_RPC_URL=
POLYGON_RPC_URL=
```

清算控制台右侧候选列表可以接入服务器侧公共候选池。公共候选池由链服务器扫描并推送，
客户端只读取结果，不消耗用户自己的 RPC credit：

```env
PUBLIC_LIQUIDATION_FEED_URL=
PUBLIC_LIQUIDATION_FEED_BNB_URL=
PUBLIC_LIQUIDATION_FEED_ARBITRUM_URL=
```

如果要让 30 个用户按顺序轮转执行，配置队列服务地址。客户端会先检查本用户钱包和
SuperMT Node endpoint 限额，到期或限额耗尽会退出队列；执行结果会回传给队列服务，
由服务端决定是否把成功用户移动到队尾：

```env
LIQUIDATION_QUEUE_API_BASE_URL=
```

如果只查看数据，可以不配置私钥。如果需要使用执行相关功能，需要配置：

```env
PRIVATE_KEY=
```

资金方式可在通用设置中选择：

- Flash loan
- Self funded

## 更新方式

SuperARB 会在启动时检查 GitHub 最新版本。如果发现本地版本落后，系统会提示先更新后继续使用。

常规更新流程：

```bash
git pull
npm install
npm run dashboard
```

详细变更记录见 [升级日志](docs/upgrade-log.md)。

## 安全建议

- 不要提交 `.env` 文件。
- 不要把私钥、RPC 密钥或授权码发布到公开渠道。
- 如果只需要查看数据，不建议配置私钥。
- 建议在更新后重新启动 dashboard，确保版本和前端资源一致。

## 项目状态

SuperARB 当前处于持续迭代阶段，重点优化本地配置体验、数据可见性、版本更新提示和多页面操作流程。
