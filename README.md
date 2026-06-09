# SuperARB Client

Version: 1.4.8.1

Local dashboard for monitoring supported market data and runtime status.

## Run

```bash
npm install
npm run dashboard
```

Default local URL:

```text
http://127.0.0.1:4311/
```

If the port is occupied, set `DASHBOARD_PORT` in a local `.env` file and restart. Local API calls automatically retry common dashboard ports.

Controllers and desktop launchers must use the same `.env` value as the dashboard. Resolve the client URL with:

```bash
npm run dashboard:url --silent
```

For example, `DASHBOARD_PORT=4310` opens `http://127.0.0.1:4310/`; `DASHBOARD_PORT=4311` opens `http://127.0.0.1:4311/`.

## Configuration

Copy `.env.example` to `.env` and fill local values in your own environment.

Do not commit `.env` or machine-specific configuration.

## Build

```bash
npm run build
```
