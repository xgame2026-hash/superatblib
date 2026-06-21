# SuperARB Client

Version: 1.5.0

Local dashboard for monitoring supported market data and runtime status.

## Run

```bash
git clone git@github.com:xgame2026-hash/superatblib.git
cd superatblib
npm install
npm run dashboard
```

Equivalent startup commands:

```bash
npm run dev
npm start
```

Default local URL:

```text
http://127.0.0.1:4311/
```

If the port is occupied, the dashboard automatically starts on the next available local port. Local API calls use the active dashboard port from the page/runtime state instead of a fixed port list.

Controllers and desktop launchers must use the same `.env` value as the dashboard. Resolve the client URL with:

```bash
npm run dashboard:url --silent
```

For example, if `4311` is occupied and Vite starts on `4316`, `npm run dashboard:url --silent` prints `http://127.0.0.1:4316/`.

If `npm run dashboard` reports `Missing script: "dashboard"`, the local checkout is not using the latest root `package.json`. Run these commands from the repository root:

```bash
git pull origin main
npm install
npm run
```

The script list must include `dashboard`, `dev`, and `start`.

## Configuration

Copy `.env.example` to `.env` and fill local values in your own environment.

Do not commit `.env` or machine-specific configuration.

## Build

```bash
npm run build
```
