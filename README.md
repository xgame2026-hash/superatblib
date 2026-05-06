# Super Liquidation Dashboard

一个用于多链市场监控、清算机会观察、闪电贷数据查看和执行辅助的本地控制台。

## 功能概览

- 多链 RPC 配置
- 清算与闪电贷数据看板
- Morpho Blue 风险面板
- 执行控制台
- 本地授权码校验
- GitHub 版本检查与更新提示

## 快速开始

复制配置模板：

```bash
cp .env.example .env
```

Windows:

```bat
copy .env.example .env
```

安装依赖并启动：

```bash
npm install
npm run dashboard
```

打开页面后输入授权码。进入系统后，可在“系统设置 / 通用设置”里维护 RPC、私钥、语言和资金方式。

## 必要配置

默认看板至少需要配置：

```env
ETHEREUM_RPC_URL=
```

如需使用其它链，再按需配置：

```env
BNB_RPC_URL=
ARBITRUM_RPC_URL=
BASE_RPC_URL=
POLYGON_RPC_URL=
```

如需执行交易，需要配置：

```env
PRIVATE_KEY=
```

## 更新

客户端启动时会检查 GitHub 最新版本。如果发现新版本，系统会提示先更新后继续使用：

```bash
git pull
npm install
npm run dashboard
```

## 安全说明

- `.env` 仅保存在本地，不应提交到 GitHub。
- 私钥只用于本地执行相关功能。
- 普通查看数据只需要 RPC，不需要私钥。
