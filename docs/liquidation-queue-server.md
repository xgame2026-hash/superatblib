# 清算排队服务器

这个服务要部署在独立服务器上，不运行在用户客户端里。客户端只负责上报当前钱包、链、RPC endpoint 用量和执行结果；排队服务器负责决定谁现在可以执行。

## 职责

- 按 `chain + market` 分开排队，例如 `arbitrum:aave-v3-arbitrum` 和 `bnb:aave-v3-bnb` 是两个队列。
- 同一个钱包地址在同一个队列中只占一个位置。
- 客户端合格时进入队列；gas 不足、RPC 过期或限额耗尽时退出队列。
- 队列第一位返回 `action: "execute"`，其他用户返回 `action: "wait_turn"`。
- 用户执行成功或失败后调用 `event`，该用户排到队尾，下一个用户获得执行机会。
- 队列状态保存到 JSON 文件，服务重启后不会立即丢失。

## 启动

```bash
cp queue.env.example .env
npm install
npm run queue:server
```

默认监听：

```text
http://0.0.0.0:4311
```

生产环境建议用 nginx 反代到 HTTPS，例如：

```text
https://queue.supermtnode.io
```

## BNB / ARB RPC 节点部署

先部署两个独立队列实例：

| 节点 | IP | 建议域名 | 允许链 |
|---|---:|---|---|
| supermtnode-bnb-rpc-01 | 54.254.175.13 | bsc.rpc.supermtnode.io | bnb |
| supermtnode-arb-rpc-01 | 54.254.109.116 | arb.rpc.supermtnode.io | arbitrum |

BNB 节点 `.env`：

```env
LIQUIDATION_QUEUE_HOST=0.0.0.0
LIQUIDATION_QUEUE_PORT=4311
LIQUIDATION_QUEUE_STATE_FILE=/var/lib/superarb/liquidation-queue-bnb.json
LIQUIDATION_QUEUE_MEMBER_TTL_SECONDS=120
LIQUIDATION_QUEUE_LEASE_SECONDS=45
LIQUIDATION_QUEUE_ALLOWED_CHAINS=bnb
LIQUIDATION_QUEUE_ADMIN_TOKEN=
```

ARB 节点 `.env`：

```env
LIQUIDATION_QUEUE_HOST=0.0.0.0
LIQUIDATION_QUEUE_PORT=4311
LIQUIDATION_QUEUE_STATE_FILE=/var/lib/superarb/liquidation-queue-arbitrum.json
LIQUIDATION_QUEUE_MEMBER_TTL_SECONDS=120
LIQUIDATION_QUEUE_LEASE_SECONDS=45
LIQUIDATION_QUEUE_ALLOWED_CHAINS=arbitrum
LIQUIDATION_QUEUE_ADMIN_TOKEN=
```

如果 nginx 和 RPC 网关已经在 443 上，可以把队列接口挂到同一个域名的固定路径：

```nginx
location /api/admin/liquidation-queue/ {
  proxy_pass http://127.0.0.1:4311/api/admin/liquidation-queue/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

这样客户端可以继续使用：

```env
SUPERMTNODE_LIQUIDATION_QUEUE_ENABLED=true
SUPERMTNODE_API_BASE_URL=https://bsc.rpc.supermtnode.io
```

或直接写：

```env
LIQUIDATION_QUEUE_API_BASE_URL=https://bsc.rpc.supermtnode.io/api/admin/liquidation-queue
```

ARB 客户端同理替换成 `https://arb.rpc.supermtnode.io/api/admin/liquidation-queue`。

## 客户端配置

用户客户端 `.env` 配置：

```env
LIQUIDATION_QUEUE_API_BASE_URL=https://queue.supermtnode.io
```

如果排队服务器设置了 `LIQUIDATION_QUEUE_ADMIN_TOKEN`，客户端请求需要带同一个 token。当前客户端会优先使用 SuperMT Node admin token；后续可以单独拆出队列 token 配置。

## 接口

### 查询/登记队列状态

```http
POST /status
POST /api/admin/liquidation-queue/status
```

请求示例：

```json
{
  "chain": "arbitrum",
  "market": "aave-v3-arbitrum",
  "walletAddress": "0x1111111111111111111111111111111111111111",
  "endpointSlug": "arb-user-1",
  "rpcEnv": "ARBITRUM_RPC_URL",
  "remainingRequests": 100,
  "eligible": true
}
```

第一位用户响应：

```json
{
  "ok": true,
  "queue": {
    "enabled": true,
    "status": "execute",
    "action": "execute",
    "position": 1,
    "size": 30
  }
}
```

等待用户响应：

```json
{
  "ok": true,
  "queue": {
    "enabled": true,
    "status": "wait_turn",
    "action": "wait_turn",
    "position": 8,
    "size": 30
  }
}
```

### 上报执行结果

```http
POST /event
POST /api/admin/liquidation-queue/event
```

请求示例：

```json
{
  "chain": "arbitrum",
  "market": "aave-v3-arbitrum",
  "walletAddress": "0x1111111111111111111111111111111111111111",
  "endpointSlug": "arb-user-1",
  "outcome": "success"
}
```

服务收到后会把该钱包排到队尾。

## 运行参数

```env
LIQUIDATION_QUEUE_HOST=0.0.0.0
LIQUIDATION_QUEUE_PORT=4311
LIQUIDATION_QUEUE_STATE_FILE=/var/lib/superarb/liquidation-queue.json
LIQUIDATION_QUEUE_MEMBER_TTL_SECONDS=120
LIQUIDATION_QUEUE_LEASE_SECONDS=45
LIQUIDATION_QUEUE_ALLOWED_CHAINS=
LIQUIDATION_QUEUE_ADMIN_TOKEN=
```

`LIQUIDATION_QUEUE_MEMBER_TTL_SECONDS` 控制客户端多久不上报就从队列移除。`LIQUIDATION_QUEUE_LEASE_SECONDS` 控制第一位执行权保留多久，避免一个用户卡住队列。
