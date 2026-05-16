# SuperARB Client

Version: 1.2

## Install

```bash
git clone https://github.com/xgame2026-hash/superatblib.git
cd superatblib
cp .env.example .env
npm install
npm run dashboard
```

The dashboard runs at:

```text
http://127.0.0.1:4310/
```

## Configuration

Edit `.env` after copying `.env.example`. Do not commit `.env`.

Required fields depend on the chain you use:

- `PRIVATE_KEY`
- `ETHEREUM_RPC_URL`
- `BNB_RPC_URL`
- `ARBITRUM_RPC_URL`

The client reports live start/stop queue status to the configured queue service so the management dashboard can show currently connected wallets.
