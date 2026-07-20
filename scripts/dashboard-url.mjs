import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve } from "node:path";

const DEFAULT_DASHBOARD_PORT = 4311;
const RUNTIME_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const cwd = process.cwd();
const profile = normalizeProfile(process.env.LIQ2_PROFILE);
const envPath = resolve(cwd, process.env.LIQ2_ENV_FILE || (profile ? `.env.${profile}` : ".env"));
const stateDirectory = resolve(cwd, process.env.LIQ2_STATE_DIR || (profile ? `.superarb/${profile}` : ".superarb"));
const runtimePath = resolve(stateDirectory, "dashboard-runtime.json");
const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
const runtime = readRuntimeUrl(runtimePath);
const configuredPort = normalizePort(process.env.DASHBOARD_PORT || env.DASHBOARD_PORT, DEFAULT_DASHBOARD_PORT);
const runtimeAlive = runtime ? await isDashboardPort(runtime.port) : false;
const port = runtimeAlive ? runtime.port : await discoverDashboardPort(configuredPort);

if (!port) {
  console.error("Dashboard is not running. Start it with: npm run dashboard");
  process.exitCode = 1;
} else {
  console.log(`http://127.0.0.1:${port}/`);
}

function parseEnv(source) {
  const env = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return env;
}

function normalizeProfile(value) {
  const profile = String(value ?? "").trim();
  if (!profile) return "";
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(profile)) {
    throw new Error("LIQ2_PROFILE must contain only letters, numbers, underscores, or hyphens (max 32 characters)");
  }
  return profile;
}

function normalizePort(value, fallback) {
  const port = Number(String(value ?? "").trim());
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return fallback;
  return port;
}

function readRuntimeUrl(path) {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const port = normalizePort(parsed?.port, 0);
    const updatedAt = Date.parse(String(parsed?.updatedAt ?? ""));
    if (!port || !Number.isFinite(updatedAt) || Date.now() - updatedAt > RUNTIME_MAX_AGE_MS) return null;
    return { port };
  } catch {
    return null;
  }
}

async function discoverDashboardPort(startPort) {
  if (await isDashboardPort(startPort)) return startPort;
  for (let port = startPort + 1; port <= 65535; port += 1) {
    if (await isDashboardPort(port)) return port;
  }
  return null;
}

async function isDashboardPort(port) {
  if (!(await isListening(port))) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/settings`, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => ({}));
    return Boolean(payload && typeof payload === "object" && "env" in payload && "path" in payload);
  } catch {
    return false;
  }
}

function isListening(port) {
  return new Promise((resolveAlive) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = (alive) => {
      socket.removeAllListeners();
      socket.destroy();
      resolveAlive(alive);
    };
    socket.setTimeout(300);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}
