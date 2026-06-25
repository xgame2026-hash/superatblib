# tx2 接入指南（liq2 1.6.0）

本文档只描述 liq2 1.6.0 切割后的 tx2 接入方式。新链路只维护一个会员数据源：

```text
https://private.superarb.ai
```

tx2 不再依赖 `manage.supermtnode.io`、`state.supermtaccess.com`，也不应再读取旧的 state 队列接口。排行榜、在线用户、加密私钥都以 `private.superarb.ai` 的 `liq2_user_profiles` 表为准。

## 1. 总体职责

liq2 客户端负责：

- 登录时校验授权码。
- 启动/排队/心跳时提交用户资料到 `private.superarb.ai`。
- 用 tx2 公钥加密用户私钥，只上传密文。
- 更新授权金额、套利强度、凭证模式、套餐、RPC、token、USDT 余额等资料。

private 后端负责：

- 保存 `liq2_user_profiles` 用户表。
- 维护在线/脱机状态。
- 维护排行榜数据。
- 定时维护钱包 USDT 余额。
- 对外提供 tx2 可读取的用户列表。

tx2 负责：

- 从 `private.superarb.ai` 读取用户表。
- 只处理普通用户、在线用户。
- 使用 tx2 私钥解密 `encrypted_private_key`。
- 不向链上验证用户的 RPC/token 是否真实可用。
- 不用授权码做执行凭证。

## 2. 当前用户表

主表：`liq2_user_profiles`

| 字段 | 含义 | tx2 使用方式 |
| --- | --- | --- |
| `system_id` | 系统 ID，格式 `chain:钱包后8位`，主键 | tx2 的用户唯一 ID |
| `chain` | 链，如 `bnb` | 执行链 |
| `wallet_address` | 钱包地址 | 执行钱包地址 |
| `rpc_url` | 用户套餐 RPC URL | 只作为计费/套餐信息，不作为 tx2 必须验证项 |
| `rpc_token` | 用户套餐 token | 只作为计费/套餐信息，不作为 tx2 必须验证项 |
| `password` | 高级用户/后台用途密码 | 普通执行不依赖 |
| `encrypted_private_key` | 给 tx2 解密的私钥密文 | tx2 必须读取并解密 |
| `credential_auth_mode` | 凭证模式：`single` / `loop` | 决定单次或循环执行策略 |
| `single_trade_auth_amount_usdt` | 授权金额 | tx2 执行金额上限参考 |
| `arbitrage_intensity` | 套利强度 | tx2 执行强度参考 |
| `rpc_plan_type` | 套餐类型 | 展示/计费参考 |
| `rpc_plan_name` | 套餐名称 | 展示/计费参考 |
| `wallet_usdt` | 钱包 USDT 余额 | 排行榜展示、排序参考 |
| `nickname` | 昵称/备注 | 后台识别 |
| `status` | `online` / `offline` / `stopped` | tx2 只应处理 `online` |
| `heartbeat_at` | 最近心跳时间 | 判断掉线、过期保护 |

注意：`encrypted_private_key` 只需要第一次成功上传。后续 liq2 启动或心跳，不应重复覆盖已有密文，除非服务端原字段为空。

## 3. liq2 提交流程

liq2 启动后提交：

```http
POST https://private.superarb.ai/api/internal/liq2-wallet/bootstrap
Content-Type: application/json
Authorization: Bearer <appToken>
```

关键 payload：

```json
{
  "source": "liq2-client",
  "clientVersion": "1.6.0",
  "protocolVersion": "liq2-cutover-20260624-v160",
  "chain": "bnb",
  "walletAddress": "0x...",
  "privateKeyCipher": "<encrypted for tx2>",
  "appToken": "<token>",
  "rpcUrl": "https://rpc.supermtnode.io/bnb/...",
  "rpcToken": "<token>",
  "credentialAuthMode": "single",
  "singleTradeAuthAmountUsdt": "1000",
  "arbitrageIntensity": "conservative",
  "rpcPlanType": "basic",
  "rpcPlanName": "BNB plan",
  "walletUsdt": "0",
  "status": "online"
}
```

版本要求：

- `clientVersion` 必须是 `1.6.0`
- `protocolVersion` 必须是 `liq2-cutover-20260624-v160`
- 旧版本必须拒绝，返回 `LIQ2_UPGRADE_REQUIRED`

授权金额说明：

- `singleTradeAuthAmountUsdt` 允许用户提交很大的数字。
- private 后端会做字符串规整，避免因为超出普通数字范围导致写表失败。
- tx2 读取时按字符串/decimal 处理，不要用 JS number 直接承载超大金额。

## 4. tx2 读取用户列表

推荐 tx2 读取后台管理接口，而不是排行榜接口，因为后台接口包含加密私钥：

```http
GET https://private.superarb.ai/api/internal/users
```

该接口需要 tx2/admin 鉴权。鉴权方式以 private 后端实际配置为准，常见字段是：

```http
X-Tx-Admin-Timestamp: <timestamp>
X-Tx-Admin-Signature: <hmac-sha256>
```

读取后 tx2 应过滤：

- `status === "online"`
- `walletSubmitted === true`
- `encryptedPrivateKey` 或 `privateKeyCipher` 存在
- 高级用户如果用于后台管理，不进入普通排行榜执行队列

返回字段映射：

```json
{
  "ok": true,
  "users": [
    {
      "systemId": "bnb:edea8982",
      "chain": "bnb",
      "walletAddress": "0x...",
      "rpcUrl": "https://rpc.supermtnode.io/bnb/...",
      "rpcToken": "...",
      "password": "...",
      "privateKeyCipher": "...",
      "encryptedPrivateKey": "...",
      "credentialAuthMode": "single",
      "singleTradeAuthAmountUsdt": "1000.00000000",
      "arbitrageIntensity": "conservative",
      "rpcPlanType": "basic",
      "rpcPlanName": "BNB plan",
      "walletUsdt": "2377.11000000",
      "status": "online",
      "heartbeatAt": "2026-06-24T..."
    }
  ]
}
```

## 5. tx2 解密私钥

liq2 使用 tx2 公钥加密私钥。公钥来源：

```text
liq2/server/tx-wallet-public.pem
```

tx2 必须使用对应私钥解密：

```text
tx2 私钥文件由 tx2 端维护，不应出现在 liq2 仓库。
```

解密要求：

- 只解密 `encrypted_private_key` / `privateKeyCipher`。
- 不要要求 liq2 上传明文私钥。
- 解密失败时标记该用户不可执行，但不要影响其他用户。
- 解密成功后，校验解出的私钥地址必须等于 `wallet_address`。

## 6. 排行榜与状态

排行榜公开接口：

```http
GET https://private.superarb.ai/api/liq2/leaderboard
```

用途：

- liq2 前端排行榜展示。
- 显示在线钱包。
- 显示 USDT 余额。
- 不包含私钥密文、RPC token、password。

示例返回：

```json
{
  "ok": true,
  "source": "private.superarb.ai/liq2_user_profiles",
  "queueTransport": "private-global",
  "queueParticipantCount": 23,
  "queuedWallets": [
    {
      "id": "bnb:ff5a9a37",
      "chain": "bnb",
      "chainLabel": "BNB",
      "walletAddress": "0x...",
      "walletShort": "0x61cf...9a37",
      "usdt": "2377.11000000",
      "status": "online"
    }
  ]
}
```

注意：

- `id` / `system_id` 必须统一为 `chain:钱包后8位`。
- 不再使用旧格式 `bnb_xxxxxx_yyyy`。
- 排行榜只显示普通在线用户。
- 高级用户由后台手动维护，不进入普通排行榜。

## 7. 在线/脱机规则

liq2 正常运行：

- 提交 `status=online`
- 持续心跳，更新 `heartbeat_at`

用户手动暂停/停止：

- 提交 `status=offline` 或 `status=stopped`
- tx2 不应继续执行

异常断电/断网：

- private 后端根据 `heartbeat_at` 和保护时间判断脱机
- tx2 读取时应优先看 `status`
- 如需要更严格，可同时判断 `heartbeat_at` 是否超过保护时间

## 8. RPC/token 规则

rpc/token 在 1.6.0 的定位：

- 用于套餐识别和计费。
- 不用于 tx2 判断用户是否能执行。
- 不要求 tx2 用用户 rpc/token 去链上验证。
- 多用户共用同一 RPC 是允许的。
- 多用户共用时按用量叠加扣费。

tx2 不应该因为以下情况拒绝用户进入队列：

- RPC URL 相同
- token 相同
- RPC 无法被 tx2 本地验证
- token 无法被旧 state 服务验证

授权码只用于登录有效性校验，不是 tx2 执行凭证。

## 9. 不再使用的路径

tx2 和 liq2 1.6.0 不应再依赖：

```text
manage.supermtnode.io
state.supermtaccess.com
https://api.supermtnode.io/api/public/liquidations/queue-status
https://private.superarb.ai/api/liquidation-queue/status
```

当前应使用：

```text
https://private.superarb.ai/api/internal/users
https://private.superarb.ai/api/internal/liq2-wallet/bootstrap
https://private.superarb.ai/api/liq2/leaderboard
```

## 10. 已发收益接口

liq2 总览会读取全网已发收益：

```http
GET https://private.superarb.ai/api/liq2/paid-profit
```

返回示例：

```json
{
  "ok": true,
  "source": "private.superarb.ai/liq2_paid_profit_events",
  "totalPaidUsdt": "1234.56000000",
  "total_paid_usdt": "1234.56000000",
  "payoutCount": 10,
  "payout_count": 10,
  "updatedAt": "2026-06-25T..."
}
```

tx2 发放收益后调用内部累加接口：

```http
POST https://private.superarb.ai/api/internal/liq2/paid-profit
Content-Type: application/json
X-Tx-Admin-Timestamp: <timestamp>
X-Tx-Admin-Signature: <hmac-sha256>
```

签名规则与 `GET /api/internal/users` 一致：

```text
signature = HMAC_SHA256(TX_ADMIN_API_KEY, timestamp + "." + method + "." + originalUrl + "." + rawBody)
```

payload：

```json
{
  "eventId": "txHash:index 或 tx2 自己生成的唯一ID",
  "amountUsdt": "12.34",
  "chain": "bnb",
  "walletAddress": "0x...",
  "txHash": "0x...",
  "source": "tx2"
}
```

要求：

- 该接口只允许 tx2 服务端调用。liq2 客户端只能读 `GET /api/liq2/paid-profit`，不能调用任何 internal POST 推送接口。
- 必须使用服务端 `TX_ADMIN_API_KEY` 或 `PRIVATE_MEMBER_ADMIN_API_KEY` 生成 HMAC，不允许把密钥放到浏览器/liq2 客户端。
- 请求不能带浏览器 `Origin` / `Referer` 头；private 会拒绝浏览器来源写入。
- `source` 只能是 `tx2` 或 `tx2-*`。
- `amountUsdt` 必须大于 0。
- `eventId` 必填，用于幂等；同一个 `eventId` 重复提交不会重复累加。
- `amountUsdt` 按字符串/decimal 处理，不要用 JS number 承载超大金额。
- tx2 推送前必须本地校验 `eventId/amountUsdt/source/walletAddress/txHash`，不合格不能进入推送队列。
- tx2 单笔推送成功后必须校验 private 返回的 `ok=true`、`eventId`、`amountUsdt` 和汇总字段；校验失败的事件保留在 tx2 outbox 重试，不标记 sent。
- tx2 标记 outbox `sent` 时同步保存 private 返回的 `totalPaidUsdt`、`payoutCount`、`updatedAt`，用于确认当前累计发放收益和发放笔数已经同步。

返回：

```json
{
  "ok": true,
  "skipped": false,
  "amountUsdt": "12.34000000",
  "eventId": "txHash:index",
  "totalPaidUsdt": "1246.90000000",
  "payoutCount": 11
}
```

`skipped=true` 表示该 `eventId` 已经提交过，本次没有重复累加。

历史回填可以使用同一 HMAC 鉴权的批量接口，避免逐笔提交触发限流：

```http
POST https://private.superarb.ai/api/internal/liq2/paid-profit/bulk
Content-Type: application/json
X-Tx-Admin-Timestamp: <timestamp>
X-Tx-Admin-Signature: <hmac-sha256>
```

payload：

```json
{
  "events": [
    {
      "eventId": "liq2-paid-profit:0x...",
      "amountUsdt": "12.34000000",
      "chain": "bnb",
      "walletAddress": "0x...",
      "txHash": "0x...",
      "source": "tx2-paid-profit-backfill"
    }
  ]
}
```

## 11. tx2 最小执行流程

1. 定时读取 `GET /api/internal/users`。
2. 过滤 `status=online` 的普通用户。
3. 检查 `encryptedPrivateKey/privateKeyCipher` 是否存在。
4. 使用 tx2 私钥解密。
5. 校验解密私钥地址等于 `walletAddress`。
6. 读取 `credentialAuthMode`、`singleTradeAuthAmountUsdt`、`arbitrageIntensity`。
7. 根据策略执行。
8. 执行失败只标记单用户，不影响其他用户。
9. 不因 RPC/token 复用拒绝用户。
10. 不接旧 state/manage 路径。

## 12. 发布前检查

tx2 接入前应确认：

- private 后端 `private-superarb` PM2 在线。
- `GET /api/liq2/leaderboard` 返回 `source=private.superarb.ai/liq2_user_profiles`。
- `queueTransport=private-global`。
- `queuedWallets` 有在线钱包。
- `GET /api/internal/users` 能读到 `encryptedPrivateKey/privateKeyCipher`。
- 旧版 liq2 提交会被拒绝：`LIQ2_UPGRADE_REQUIRED`。
- 新版 liq2 `1.6.0` 提交成功。
- 超大 `singleTradeAuthAmountUsdt` 不会造成写表失败。
- `GET /api/liq2/paid-profit` 能返回全网已发收益。
- `POST /api/internal/liq2/paid-profit` 使用同一 `eventId` 重复提交时不会重复累加。
