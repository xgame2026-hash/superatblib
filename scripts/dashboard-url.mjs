import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_DASHBOARD_PORT = 4311;

const cwd = process.cwd();
const envPath = resolve(cwd, ".env");
const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
const port = normalizePort(process.env.DASHBOARD_PORT || env.DASHBOARD_PORT, DEFAULT_DASHBOARD_PORT);

console.log(`http://127.0.0.1:${port}/`);

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

function normalizePort(value, fallback) {
  const port = Number(String(value ?? "").trim());
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return fallback;
  return port;
}
