# SuperARB Client

Version: 1.4.3

SuperARB Client is a local liquidation dashboard and execution console. It reads liquidation snapshots, live WSS queue state, asset status, service status, and contract ledger data from the official SuperARB/SuperMT services.

> This repository contains the local client. It is not a standalone indexer or liquidation engine. Some dashboard sections require a valid authorization code and official service tokens.

## 中文说明

### 功能范围

- 最新清算排行榜与排队地址列表
- WSS 队列连接状态、排队地址数量、订阅者数量
- 资产状态与今日增加金额
- 清算策略、服务状态、交易图谱、新闻与设置面板
- 本地 `.env` 配置管理

### 快速启动

```bash
git clone https://github.com/xgame2026-hash/superatblib.git
cd superatblib
cp .env.example .env
npm install
npm run dashboard
```

默认地址：

```text
http://127.0.0.1:4310/
```

如果 `4310` 端口被占用，`npm run dashboard` 会自动尝试下一个可用端口，例如 `4311`。也可以在设置页保存“端口设置”，或直接编辑 `.env`：

```dotenv
DASHBOARD_PORT=4311
```

重启客户端后打开：

```text
http://127.0.0.1:4311/
```

### 首次运行必须知道的事

复制 `.env.example` 到 `.env` 只能提供默认配置模板，不能替代账号授权。

进入控制台需要有效授权码，格式类似：

```text
SMT-XXXX-XXXX-XXXX-XXXX
```

没有授权码时，页面会停在授权入口，不能看到控制台内部页面。

“最新清算”页面依赖以下官方服务：

| 数据 | 默认环境变量 | 用途 |
| --- | --- | --- |
| 清算快照 | `LIQUIDATION_SNAPSHOT_API_URL` | 排行榜、策略候选、基础队列数据 |
| WSS 队列状态 | `LIQUIDATION_QUEUE_WSS_STATUS_URL` | 当前排队地址、连接状态、队列数量 |
| 今日合约流水 | `LIQUIDATION_QUEUE_TX_EVENTS_URL` | 计算“今日增加” |
| WSS 授权 | `LIQUIDATION_QUEUE_WSS_TOKEN` | 访问队列与合约流水服务 |
| 服务授权 | `SUPERMTNODE_APP_TOKEN` | 官方服务校验 |

如果只执行 `cp .env.example .env`：

- 有效授权码仍然是必需的。
- 如果官方公开服务在线，排行榜和排队地址可能正常显示。
- 如果 `LIQUIDATION_QUEUE_WSS_TOKEN` 缺失、过期或被服务端撤销，“今日增加”可能显示为 `--` 或 `0 USDT`。
- 如果远端 WSS 队列没有在线地址，列表会显示空状态。

### 配置说明

编辑 `.env`，不要提交 `.env` 到 Git。

常用配置：

```dotenv
BNB_RPC_URL=
ARBITRUM_RPC_URL=
ETHEREUM_RPC_URL=
SUPERMTNODE_APP_TOKEN=
LIQUIDATION_QUEUE_WSS_TOKEN=
LIQUIDATION_SNAPSHOT_API_URL=https://bsc.rpc.supermtnode.io/api/public/liquidations/snapshot
LIQUIDATION_QUEUE_TX_EVENTS_URL=https://private.superarb.ai/api/liquidation-queue/contract-events/today
DASHBOARD_PORT=4310
```

字段说明：

- `BNB_RPC_URL` / `ARBITRUM_RPC_URL` / `ETHEREUM_RPC_URL`：网络访问端点，用于读取公开链上状态。
- `SUPERMTNODE_APP_TOKEN`：官方 SuperMT Node 服务授权。
- `LIQUIDATION_QUEUE_WSS_TOKEN`：WSS 队列与今日流水授权。
- `LIQUIDATION_SNAPSHOT_API_URL`：最新清算快照数据源。
- `LIQUIDATION_QUEUE_TX_EVENTS_URL`：官方合约流水数据源，用于计算今日增加。
- `DASHBOARD_PORT`：本地客户端端口；同一台机器运行多个客户端时可分别设置为 `4311`、`4312` 等，重启后生效。

### “今日增加”如何计算

客户端通过官方安全服务读取今日记录，并在页面展示净变化。正数显示绿色，负数显示红色。

如果官方服务暂时没有返回记录，页面会显示 `0 USDT`、`--` 或空值，取决于接口返回和本地缓存状态。

### 常见问题

#### 页面停在授权码输入框

这是正常的安全入口。需要有效授权码才能进入控制台。

#### `npm run dashboard` 遇到端口占用

开发服务会自动尝试下一个可用端口。如果想固定端口，可以在设置页保存“端口设置”，或编辑 `.env` 后重启：

```dotenv
DASHBOARD_PORT=4311
```

#### “最新清算”没有地址列表

检查：

- 是否已经通过授权码登录
- `LIQUIDATION_SNAPSHOT_API_URL` 是否可访问
- WSS 队列状态接口是否可访问
- 当前官方 WSS 队列是否真的有在线地址

#### “今日增加”没有显示

检查：

- `LIQUIDATION_QUEUE_TX_EVENTS_URL` 是否配置
- `LIQUIDATION_QUEUE_WSS_TOKEN` 是否有效
- 官方合约流水服务是否已返回今日记录
- 今日是否真的存在相关 USDT 合约流水

#### 网络数据或资产状态异常

检查对应链的网络端点：

- `BNB_RPC_URL`
- `ARBITRUM_RPC_URL`
- `ETHEREUM_RPC_URL`
- fallback 端点是否还能访问

### 安全说明

- 不要提交 `.env`。
- 不要把 `SUPERMTNODE_APP_TOKEN`、`LIQUIDATION_QUEUE_WSS_TOKEN` 发布到公开仓库。
- `.env.example` 应只作为模板。生产部署应使用自己的授权码、服务 token 和网络端点。
- 仅在可信环境中运行客户端，并妥善保护本地配置文件。

### 构建

```bash
npm run build
```

预览生产构建：

```bash
npm run preview
```

如果默认端口被占用，修改 `.env` 后重启：

```dotenv
DASHBOARD_PORT=4311
```

## English

### Overview

SuperARB Client is a local dashboard and execution console for liquidation monitoring. It consumes official SuperARB/SuperMT services for liquidation snapshots, live WSS queue status, asset status, service status, and contract ledger data.

This client is not a standalone indexer or liquidation backend. A valid authorization code and official service tokens are required for some sections.

### Features

- Latest liquidation rankings and queued address table
- WSS queue status, participant count, and subscriber count
- Asset status and today's net change
- Strategy, service status, transaction graph, news, and settings views
- Local `.env` based configuration

### Quick Start

```bash
git clone https://github.com/xgame2026-hash/superatblib.git
cd superatblib
cp .env.example .env
npm install
npm run dashboard
```

Default URL:

```text
http://127.0.0.1:4310/
```

If port `4310` is already in use, `npm run dashboard` automatically tries the next available port, for example `4311`. You can also save a different port in Settings or edit `.env`:

```dotenv
DASHBOARD_PORT=4311
```

Restart the client, then open `http://127.0.0.1:4311/`.

Then open:

```text
http://127.0.0.1:4311/
```

### Important First-Run Notes

Copying `.env.example` to `.env` only creates a local configuration file. It does not create account access.

The dashboard requires a valid authorization code, for example:

```text
SMT-XXXX-XXXX-XXXX-XXXX
```

Without a valid code, the app remains on the authorization screen and the internal dashboard pages are not visible.

The Latest Liquidations view depends on these official services:

| Data | Default env var | Purpose |
| --- | --- | --- |
| Liquidation snapshot | `LIQUIDATION_SNAPSHOT_API_URL` | Rankings, strategy candidates, base queue data |
| WSS queue status | `LIQUIDATION_QUEUE_WSS_STATUS_URL` | Active queued addresses, connection status, participant count |
| Today's contract ledger | `LIQUIDATION_QUEUE_TX_EVENTS_URL` | Computes today's net change |
| WSS authorization | `LIQUIDATION_QUEUE_WSS_TOKEN` | Access to queue and contract ledger services |
| Service authorization | `SUPERMTNODE_APP_TOKEN` | Official service validation |

With only `cp .env.example .env`:

- A valid authorization code is still required.
- Rankings and queued addresses may display if the official public services are online.
- Today's net change may display as `--` or `0 USDT` if `LIQUIDATION_QUEUE_WSS_TOKEN` is missing, expired, or revoked.
- The queue table can be empty when there are no active addresses in the remote WSS queue.

### Configuration

Edit `.env` after copying `.env.example`. Never commit `.env`.

Common fields:

```dotenv
BNB_RPC_URL=
ARBITRUM_RPC_URL=
ETHEREUM_RPC_URL=
SUPERMTNODE_APP_TOKEN=
LIQUIDATION_QUEUE_WSS_TOKEN=
LIQUIDATION_SNAPSHOT_API_URL=https://bsc.rpc.supermtnode.io/api/public/liquidations/snapshot
LIQUIDATION_QUEUE_TX_EVENTS_URL=https://private.superarb.ai/api/liquidation-queue/contract-events/today
DASHBOARD_PORT=4310
```

Field notes:

- `BNB_RPC_URL` / `ARBITRUM_RPC_URL` / `ETHEREUM_RPC_URL`: network access endpoints used to read public chain state.
- `SUPERMTNODE_APP_TOKEN`: official SuperMT Node service token.
- `LIQUIDATION_QUEUE_WSS_TOKEN`: authorization token for WSS queue and today's ledger services.
- `LIQUIDATION_SNAPSHOT_API_URL`: liquidation snapshot source.
- `LIQUIDATION_QUEUE_TX_EVENTS_URL`: official contract event ledger source used to calculate today's net change.
- `DASHBOARD_PORT`: local client port. Use different values such as `4311` and `4312` when running multiple clients on one machine; restart after changing it.

### How Today's Net Change Is Calculated

The client reads today's records through the official secure service and displays the net change. Positive values are shown in green. Negative values are shown in red.

If the official service has no record available yet, the page may show `0 USDT`, `--`, or an empty value depending on the response and local cache state.

### Troubleshooting

#### The app stays on the authorization screen

This is expected. A valid authorization code is required to enter the dashboard.

#### `npm run dashboard` finds the port already in use

The dev server automatically tries the next available port. To pin a specific port, set a different port in Settings or `.env`, then restart:

```dotenv
DASHBOARD_PORT=4311
```

#### The Latest Liquidations table is empty

Check:

- You are logged in with a valid authorization code.
- `LIQUIDATION_SNAPSHOT_API_URL` is reachable.
- The WSS queue status endpoint is reachable.
- The official WSS queue currently has active addresses.

#### Today's net change is missing

Check:

- `LIQUIDATION_QUEUE_TX_EVENTS_URL` is configured.
- `LIQUIDATION_QUEUE_WSS_TOKEN` is valid.
- The official contract ledger service is returning today's records.
- Related USDT contract events exist for the current local day.

#### Network data or asset status looks wrong

Check the network endpoints for the target chain:

- `BNB_RPC_URL`
- `ARBITRUM_RPC_URL`
- `ETHEREUM_RPC_URL`
- fallback endpoint availability

### Security

- Do not commit `.env`.
- Do not publish `SUPERMTNODE_APP_TOKEN` or `LIQUIDATION_QUEUE_WSS_TOKEN`.
- `.env.example` should be treated as a template. Production deployments should use their own authorization code, service tokens, and network endpoints.
- Run the client only in trusted environments and protect local configuration files carefully.

### Build

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

If the default port is in use, update `.env` and restart:

```dotenv
DASHBOARD_PORT=4311
```
