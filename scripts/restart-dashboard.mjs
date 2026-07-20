import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const parentPid = Number(process.argv[2] || 0);
const root = process.cwd();

if (!Number.isInteger(parentPid) || parentPid <= 0) process.exit(1);

const instances = discoverRunningInstances(parentPid);

await delay(800);
for (const instance of instances) {
  try {
    process.kill(instance.pid, "SIGTERM");
  } catch {
    // An instance may already have stopped itself.
  }
}

for (let attempt = 0; attempt < 120 && instances.some((instance) => processAlive(instance.pid)); attempt += 1) {
  await delay(250);
}

const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", "npm.cmd run dashboard"]
  : ["run", "dashboard"];
for (const instance of instances) {
  const env = { ...process.env, DASHBOARD_PORT: String(instance.port) };
  applyOptionalEnv(env, "LIQ2_PROFILE", instance.profile);
  applyOptionalEnv(env, "LIQ2_ENV_FILE", instance.envFile);
  applyOptionalEnv(env, "LIQ2_STATE_DIR", instance.stateDir);
  const dashboard = spawn(command, args, { cwd: root, env, detached: true, stdio: "ignore" });
  dashboard.unref();
}

function discoverRunningInstances(fallbackPid) {
  const runtimeFiles = dashboardRuntimeFiles(resolve(root, ".superarb"));
  const instances = [];
  const seenPids = new Set();
  for (const path of runtimeFiles) {
    try {
      const value = JSON.parse(readFileSync(path, "utf8"));
      const pid = Number(value.pid);
      const port = Number(value.port);
      if (!Number.isInteger(pid) || pid <= 0 || !processAlive(pid) || seenPids.has(pid)) continue;
      if (!Number.isInteger(port) || port < 1024 || port > 65535) continue;
      instances.push({
        pid,
        port,
        profile: safeProfile(value.profile),
        envFile: safePath(value.envFile),
        stateDir: safePath(value.stateDir),
      });
      seenPids.add(pid);
    } catch {
      // Ignore stale or partially written runtime records.
    }
  }
  if (!seenPids.has(fallbackPid)) {
    instances.push({
      pid: fallbackPid,
      port: safePort(process.env.DASHBOARD_PORT, 4311),
      profile: safeProfile(process.env.LIQ2_PROFILE),
      envFile: safePath(process.env.LIQ2_ENV_FILE),
      stateDir: safePath(process.env.LIQ2_STATE_DIR),
    });
  }
  return instances;
}

function dashboardRuntimeFiles(stateRoot) {
  if (!existsSync(stateRoot)) return [];
  const files = [];
  const defaultRuntime = join(stateRoot, "dashboard-runtime.json");
  if (existsSync(defaultRuntime)) files.push(defaultRuntime);
  for (const entry of readdirSync(stateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]{1,32}$/.test(entry.name)) continue;
    const candidate = join(stateRoot, entry.name, "dashboard-runtime.json");
    if (existsSync(candidate)) files.push(candidate);
  }
  return files;
}

function applyOptionalEnv(env, name, value) {
  if (value) env[name] = value;
  else delete env[name];
}

function safeProfile(value) {
  const profile = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]{1,32}$/.test(profile) ? profile : "";
}

function safePath(value) {
  const path = String(value ?? "").trim();
  return path && path.includes("\0") === false ? path : "";
}

function safePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : fallback;
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
