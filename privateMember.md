# private.superarb.ai 高级会员接入说明

本文档说明 `https://private.superarb.ai` 高级会员的登录方式、提交数据、表结构和接口边界。

重点原则：

- 高级会员走 private 站内会员入口。
- liq2 客户端继续走 liq2 1.6.0 上报接口。
- 高级会员配置不要写入 `liq2_user_profiles`，避免影响 liq2 排队、排行榜、tx2 读取链路。
- 本文档只保存在本地，不提交 GitHub。

## 1. 两套路径必须分开

| 路径 | 使用方 | 作用 | 写入表 |
| --- | --- | --- | --- |
| private 高级会员 | 人工添加的高级用户 | 登录、提交私钥、RPC、token、查看用量、修改配置 | `users` + `member_credentials` |
| liq2 客户端 | liq2 1.6.0 客户端 | 启动、注册、心跳、排行榜、tx2 读取运行用户 | `liq2_user_profiles` |

不要把高级会员配置写进 `liq2_user_profiles`。

`liq2_user_profiles` 只服务 liq2 客户端，不作为高级会员后台配置表。

## 2. 高级会员进入方式

高级会员由管理员先添加账号，然后用户访问 private 会员页面登录。

登录需要三个字段：

| 字段 | 说明 |
| --- | --- |
| 用户名 | 管理员创建的用户名 |
| 密码 | 管理员创建或用户修改后的密码 |
| 授权码 | 只验证是否有效、是否 active、是否在有效期 |

授权码只用于登录和保存配置时做有效性校验，不用于扣费、不用于链上验证、不参与 liq2 排队。

## 3. 当前已有接口

### 3.1 高级会员登录

```http
POST /api/login
Content-Type: application/json
```

请求：

```json
{
  "username": "vip_user_001",
  "password": "123456",
  "authorizationCode": "SMT-XXXX-XXXX-XXXX-XXXX"
}
```

字段规则：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `username` | string | 1-64 位 |
| `password` | string | 1-128 位 |
| `authorizationCode` | string | `SMT-XXXX-XXXX-XXXX-XXXX` |

后端动作：

1. 校验用户名和密码。
2. 调用授权码验证接口。
3. 授权码有效且 active 才允许登录。
4. 返回会员 JWT。

响应：

```json
{
  "token": "member.jwt.token",
  "user": {
    "id": 1,
    "username": "vip_user_001",
    "requiresPasswordChange": false
  }
}
```

### 3.2 查询会员状态

```http
GET /api/member/profile
Authorization: Bearer <member-token>
```

作用：

- 返回当前登录用户。
- 返回已保存授权码状态。
- 每次查询时会重新验证已保存授权码是否仍然有效。

响应：

```json
{
  "user": {
    "id": 1,
    "username": "vip_user_001",
    "requiresPasswordChange": false
  },
  "credential": {
    "authorizationCode": "SMT-XXXX-XXXX-XXXX-XXXX",
    "verifyStatus": "valid",
    "verifyMessage": "授权码验证通过，到期时间：2026-12-31T00:00:00.000Z",
    "updatedAt": "2026-06-25T00:00:00.000Z"
  }
}
```

### 3.3 查询已保存配置

```http
GET /api/member/config
Authorization: Bearer <member-token>
```

当前已有返回：

```json
{
  "configured": true,
  "walletAddress": "0x...",
  "privateKeyEncrypted": true,
  "appToken": "plain-token-for-display",
  "updatedAt": "2026-06-25T00:00:00.000Z"
}
```

当前接口只返回：

- 钱包地址
- 私钥是否已加密保存
- app token
- 更新时间

如果要显示 RPC、token 用量，需要在 `member_credentials` 增加字段并扩展这个接口。

### 3.4 保存或修改会员配置

```http
POST /api/member/credentials
Authorization: Bearer <member-token>
Content-Type: application/json
```

当前已有请求：

```json
{
  "authorizationCode": "SMT-XXXX-XXXX-XXXX-XXXX",
  "walletAddress": "0x1111111111111111111111111111111111111111",
  "encryptedPrivateKey": "给 tx2 解密的钱包私钥密文",
  "encryptedAppToken": "给 private 后端解密保存的 token 密文"
}
```

字段规则：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `authorizationCode` | 是 | 保存配置时也要验证有效 |
| `walletAddress` | 首次提交私钥时必填 | 由前端根据私钥推导 |
| `encryptedPrivateKey` | 首次必填，修改私钥时提交 | 使用 tx2 钱包公钥加密，private 只保存密文 |
| `encryptedAppToken` | 首次必填，修改 token 时提交 | 浏览器用 private 公钥加密，后端解密后再落库加密 |

当前后端逻辑：

- 首次配置必须有私钥和 token。
- 后续可以只修改私钥或只修改 token。
- 如果提交新私钥，会更新钱包地址和私钥密文。
- 如果提交新 token，会更新 token 密文。
- 保存前会重新校验授权码。

### 3.5 修改密码

```http
POST /api/member/password
Authorization: Bearer <member-token>
Content-Type: application/json
```

请求：

```json
{
  "currentPassword": "123456",
  "newPassword": "NewPassword123!"
}
```

响应：

```json
{
  "ok": true
}
```

## 4. 当前表结构

### 4.1 users

`users` 保存 private 高级会员账号。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED | 自增主键 |
| `username` | VARCHAR(64) | 登录用户名，唯一 |
| `password_hash` | VARCHAR(255) | bcrypt 密码哈希 |
| `nickname` | VARCHAR(128) | 昵称备注，当前已有字段 |
| `member_tier` | VARCHAR(32) | 会员类型，当前已有字段 |
| `created_at` | TIMESTAMP | 创建时间 |

建议值：

| `member_tier` | 说明 |
| --- | --- |
| `normal` | 普通用户 |
| `premium` | 高级会员 |

### 4.2 member_credentials

`member_credentials` 保存 private 会员配置。

| 字段 | 当前类型 | 说明 |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED | 自增主键 |
| `user_id` | BIGINT UNSIGNED | 关联 `users.id` |
| `authorization_code` | VARCHAR(512) | 授权码 |
| `wallet_address` | VARCHAR(42) | 钱包地址 |
| `wallet_public_key` | TEXT | 预留字段 |
| `private_key_cipher` | TEXT | 给 tx2 解密的钱包私钥密文 |
| `app_token_cipher` | TEXT | private 后端加密保存的 token |
| `verify_status` | ENUM | `pending`、`valid`、`invalid` |
| `verify_message` | VARCHAR(512) | 授权码校验结果 |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |

当前历史迁移里还存在一些 liq2 兼容字段，例如 `system_id`、`client_version`、`protocol_version`、`single_trade_auth_amount_usdt` 等。

高级会员不需要依赖这些 liq2 字段。高级会员配置应只使用会员配置相关字段。

## 5. 为 RPC、token、用量展示补齐字段

用户要求高级会员登录后可以：

- 提交私钥。
- 提交 RPC。
- 提交 token。
- 显示用量。
- 修改密码。
- 修改私钥。
- 修改 RPC。
- 修改 token。

当前已有私钥、token 和改密码能力，但没有独立 RPC 和用量字段。

建议在 `member_credentials` 增加以下字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `rpc_url` | TEXT NULL | 高级会员提交的 RPC |
| `rpc_token` | TEXT NULL | 高级会员提交的 RPC token，建议加密保存 |
| `rpc_usage_used` | DECIMAL(36,8) NOT NULL DEFAULT 0 | 已使用量，展示用 |
| `rpc_usage_limit` | DECIMAL(36,8) NOT NULL DEFAULT 0 | 套餐总量，展示用 |
| `rpc_usage_remaining` | DECIMAL(36,8) NOT NULL DEFAULT 0 | 剩余用量，展示用 |
| `rpc_usage_updated_at` | TIMESTAMP NULL | 用量更新时间 |

如果 token 就是现在的 `app_token_cipher`，可以不新增 `rpc_token`，但页面文案要统一叫 `token`，不要再显示 `SUPERMTNODE_APP_TOKEN`。

推荐更清晰的方式：

- `app_token_cipher` 保留兼容旧 private 页面。
- 新增 `rpc_token_cipher` 专门保存高级会员的 RPC token。
- 后续页面只显示 “token”。

## 6. 高级会员保存配置的目标 payload

建议新的高级会员配置接口仍然使用：

```http
POST /api/member/credentials
Authorization: Bearer <member-token>
Content-Type: application/json
```

目标 payload：

```json
{
  "authorizationCode": "SMT-XXXX-XXXX-XXXX-XXXX",
  "walletAddress": "0x1111111111111111111111111111111111111111",
  "encryptedPrivateKey": "给 tx2 解密的钱包私钥密文",
  "rpcUrl": "https://rpc.supermtnode.io/bnb/rpc_xxx",
  "encryptedRpcToken": "给 private 后端保存的 rpc token 密文"
}
```

保存逻辑：

1. 校验授权码有效。
2. 如果传了 `encryptedPrivateKey`，更新私钥密文和钱包地址。
3. 如果传了 `rpcUrl`，更新 RPC。
4. 如果传了 `encryptedRpcToken`，解密后再加密落库。
5. 不写 `liq2_user_profiles`。
6. 不触发 liq2 排队。
7. 不影响排行榜。

## 7. 用量展示接口

建议扩展：

```http
GET /api/member/config
Authorization: Bearer <member-token>
```

返回：

```json
{
  "configured": true,
  "walletAddress": "0x...",
  "privateKeyEncrypted": true,
  "rpcUrl": "https://rpc.supermtnode.io/bnb/rpc_xxx",
  "rpcTokenConfigured": true,
  "usage": {
    "used": "1000",
    "limit": "5000000",
    "remaining": "4999000",
    "updatedAt": "2026-06-25T00:00:00.000Z"
  },
  "updatedAt": "2026-06-25T00:00:00.000Z"
}
```

用量来源可以是：

- private 后端定时从 `supermtnode.io` 查询后维护。
- 或管理员/内部任务同步写入。

不要让 liq2 客户端负责高级会员用量展示。

## 8. 管理员添加高级会员

管理员添加高级会员应该写 `users` 表，不写 liq2 表。

建议管理员新增用户 payload：

```json
{
  "username": "vip_user_001",
  "password": "123456",
  "nickname": "高级客户A",
  "memberTier": "premium"
}
```

建议表单：

| 表单字段 | payload 字段 | 必填 | 说明 |
| --- | --- | --- | --- |
| 用户名 | `username` | 是 | 高级会员登录名 |
| 初始密码 | `password` | 是 | 用户登录后可修改 |
| 昵称备注 | `nickname` | 否 | 管理员识别 |
| 会员类型 | `memberTier` | 是 | 高级会员填 `premium` |

当前运行版本的 `POST /api/admin/users` 只接受：

```json
{
  "username": "vip_user_001",
  "password": "123456"
}
```

因此如果要完整支持高级会员，需要补齐：

- `adminUserSchema` 接收 `nickname`、`memberTier`。
- `INSERT INTO users` 写入 `nickname`、`member_tier`。
- 管理员列表读取 `users` 表显示高级会员账号。

## 9. 不能影响 liq2 客户端

高级会员相关改造要遵守以下边界：

| 事项 | 要求 |
| --- | --- |
| 不改 liq2 上报 payload | liq2 1.6.0 继续按现有 `/api/liq2/wallet` 或当前启动接口提交 |
| 不改 `liq2_user_profiles` 主流程 | liq2 排队、心跳、排行榜继续使用它 |
| 不把高级会员写进排行榜 | 高级会员是 private 会员，不是 liq2 在线用户 |
| 不让高级会员登录触发排队 | 登录 private 只是管理配置 |
| 不让 RPC/token 配置影响 liq2 扣费 | 高级会员 RPC/token 是 private 会员配置展示，不参与 liq2 队列 |
| tx2 读取仍以运行用户为准 | tx2 当前读取 `/api/internal/users`，继续服务 liq2 运行资料 |

## 10. tx2 是否读取高级会员

当前 tx2 读取：

```http
GET /api/internal/users
```

这个接口当前读取 `liq2_user_profiles`。

如果未来 tx2 也要处理高级会员的私钥、RPC、token，应新增独立接口，例如：

```http
GET /api/internal/private-members
```

该接口读取：

- `users`
- `member_credentials`

不要把高级会员混入 `/api/internal/users`，否则会影响 liq2 运行用户列表。

建议 tx2 两条线分开：

| tx2 接口 | 数据来源 | 作用 |
| --- | --- | --- |
| `/api/internal/users` | `liq2_user_profiles` | liq2 运行用户 |
| `/api/internal/private-members` | `users` + `member_credentials` | 高级会员配置 |

## 11. 当前代码与目标能力差距

当前已经具备：

- 高级会员登录：用户名、密码、授权码。
- 授权码有效性校验。
- 提交私钥密文。
- 提交 token。
- 修改密码。
- 修改私钥。
- 修改 token。

当前缺少：

- 管理员创建高级会员时写入 `member_tier = premium`。
- 管理员创建高级会员时写入昵称备注。
- 高级会员提交 `rpc_url`。
- 高级会员提交独立 `rpc_token`。
- 高级会员显示 RPC 用量。
- tx2 如果需要读取高级会员，需要独立内部接口。

## 12. 推荐落地顺序

1. 先改管理员新增用户：支持 `nickname`、`memberTier`，写 `users` 表。
2. 再改 private 会员配置：增加 RPC、token 字段，继续写 `member_credentials`。
3. 再改会员页面：显示“私钥 / RPC / token / 用量 / 修改密码”。
4. 再增加用量维护任务或查询接口。
5. 如果 tx2 要读取高级会员，再新增 `/api/internal/private-members`。

整个过程不改 liq2 客户端，不改 liq2 排队和排行榜主链路。
