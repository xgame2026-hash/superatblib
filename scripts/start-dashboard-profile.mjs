import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const profile = String(process.argv[2] ?? "").trim();
if (!/^[a-zA-Z0-9_-]{1,32}$/.test(profile)) {
  console.error("Usage: npm run dashboard:profile -- <profile>");
  process.exit(1);
}

const envFile = resolve(process.cwd(), `.env.${profile}`);
if (!existsSync(envFile)) {
  console.error(`Missing .env.${profile}. Create it locally and add that profile's WALLET_ADDRESS before starting.`);
  process.exit(1);
}

const env = parseEnv(readFileSync(envFile, "utf8"));
if (!/^0x[0-9a-fA-F]{40}$/.test(env.WALLET_ADDRESS ?? "")) {
  console.error(`.env.${profile} does not contain a valid WALLET_ADDRESS.`);
  process.exit(1);
}

const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", "npm.cmd run dashboard"]
  : ["run", "dashboard"];
const child = spawn(command, args, {
  cwd: process.cwd(),
  env: { ...process.env, LIQ2_PROFILE: profile },
  stdio: "inherit",
});
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});

function parseEnv(source) {
  const result = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return result;
}
