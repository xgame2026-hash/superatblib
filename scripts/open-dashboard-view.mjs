import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const view = process.argv[2] || "execution";
const aliases = new Map([
  ["leaderboard", "execution"],
  ["ranking", "execution"],
  ["latest", "execution"],
  ["latest-liquidations", "execution"],
]);

try {
  const { stdout } = await execFileAsync(process.execPath, ["scripts/dashboard-url.mjs"], { cwd: process.cwd() });
  const baseUrl = stdout.trim().replace(/[#?].*$/, "").replace(/\/?$/, "/");
  const targetView = aliases.get(view) || view;
  const url = `${baseUrl}#${targetView}`;
  console.log(url);
  if (process.platform === "darwin") {
    await execFileAsync("open", [url]);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message || "Dashboard is not running. Start it with: npm run dashboard");
  process.exitCode = 1;
}
