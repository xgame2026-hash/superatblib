import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const stateDir = resolve(root, ".superarb");
const progressFile = resolve(stateDir, "update-in-progress.json");
const completionFile = resolve(stateDir, "update-completed.json");
const autoUpdateStatusFile = resolve(stateDir, "auto-update-status.json");
const remote = process.env.SUPERARB_UPDATE_REMOTE?.trim() || "origin";
const branch = process.env.SUPERARB_UPDATE_BRANCH?.trim() || "main";
const autoRestartParentPid = Number(process.env.SUPERARB_UPDATE_PARENT_PID || 0);

main();

function main() {
  writeAutoUpdateStatus({ status: "checking", message: "正在检查远程版本。" });
  requireCommand("git", ["rev-parse", "--is-inside-work-tree"], "当前目录不是 Git 仓库。");
  const currentBranch = commandOutput("git", ["branch", "--show-current"]);
  if (currentBranch !== branch) fail(`升级已停止：当前分支是 ${currentBranch || "(detached)"}，要求分支是 ${branch}。`);

  const existingProgress = readJson(progressFile);
  const currentCommit = fullCommit("HEAD");
  let progress = validProgress(existingProgress) && existingProgress.toCommit === currentCommit ? existingProgress : null;

  if (!progress) {
    const dirty = commandOutput("git", ["status", "--porcelain", "--untracked-files=all"]);
    if (dirty) fail("升级已停止：工作区存在未提交或未跟踪文件，请先处理 git status 中的内容。");

    run("git", ["fetch", "--prune", remote, branch], "拉取远程版本失败。");
    const targetCommit = fullCommit(`${remote}/${branch}`);
    if (targetCommit === currentCommit) {
      writeAutoUpdateStatus({ status: "up_to_date", message: "当前代码已经是最新版。" });
      console.log("当前代码已经是最新版，无需升级。");
      return;
    }

    progress = {
      schemaVersion: 1,
      status: "installing",
      fromCommit: currentCommit,
      toCommit: targetCommit,
      fromVersion: packageVersion(),
      startedAt: new Date().toISOString(),
    };
    writeJsonAtomic(progressFile, progress);
    writeAutoUpdateStatus({ status: "updating", fromCommit: currentCommit, toCommit: targetCommit, message: "正在拉取并安装新版本。" });
    run("git", ["merge", "--ff-only", `${remote}/${branch}`], "无法以 fast-forward 方式升级；没有写入升级成功凭证。");
    if (fullCommit("HEAD") !== targetCommit) fail("升级后的 Commit 与远程目标不一致；没有写入升级成功凭证。");
  } else {
    console.log(`继续上次未完成的升级：${short(progress.fromCommit)} -> ${short(progress.toCommit)}`);
  }

  run(npmCommand(), ["ci"], "依赖安装失败；没有写入升级成功凭证。修复后可重新运行 npm run update。");
  run(npmCommand(), ["run", "build"], "生产构建失败；没有写入升级成功凭证。修复后可重新运行 npm run update。");
  if (!existsSync(resolve(root, "dist/index.html"))) fail("构建产物 dist/index.html 不存在；没有写入升级成功凭证。");

  const installedCommit = fullCommit("HEAD");
  if (installedCommit !== progress.toCommit) fail("构建期间代码 Commit 发生变化；没有写入升级成功凭证。");
  const receipt = {
    schemaVersion: 1,
    receiptId: randomUUID(),
    status: "success",
    fromCommit: progress.fromCommit,
    toCommit: installedCommit,
    fromVersion: progress.fromVersion,
    toVersion: packageVersion(),
    completedAt: new Date().toISOString(),
    buildVerified: true,
    healthCheckPassed: false,
    announcedAt: null,
  };
  writeJsonAtomic(completionFile, receipt);
  if (existsSync(progressFile)) unlinkSync(progressFile);
  console.log(`升级构建完成：${short(receipt.fromCommit)} -> ${short(receipt.toCommit)}`);
  if (autoRestartParentPid > 0) {
    writeAutoUpdateStatus({ status: "restarting", receiptId: receipt.receiptId, fromCommit: receipt.fromCommit, toCommit: receipt.toCommit, message: "升级完成，正在自动重启。" });
    scheduleAutomaticRestart(autoRestartParentPid);
    console.log("升级完成，控制台将自动重启；健康检查通过后会播报“升级完成”。");
  } else {
    writeAutoUpdateStatus({ status: "restart_required", receiptId: receipt.receiptId, fromCommit: receipt.fromCommit, toCommit: receipt.toCommit, message: "升级完成，请重新启动控制台。" });
    console.log("请重新启动控制台；新系统健康检查通过后将播报“升级完成”。");
  }
}

function scheduleAutomaticRestart(parentPid) {
  const helper = resolve(root, "scripts/restart-dashboard.mjs");
  const child = spawn(process.execPath, [helper, String(parentPid)], {
    cwd: root,
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function run(command, args, errorMessage) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: process.env });
  if (result.status !== 0) fail(errorMessage);
}

function requireCommand(command, args, errorMessage) {
  const result = spawnSync(command, args, { cwd: root, stdio: "ignore", env: process.env });
  if (result.status !== 0) fail(errorMessage);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", env: process.env });
  if (result.status !== 0) fail(`${command} ${args.join(" ")} 执行失败。`);
  return result.stdout.trim();
}

function fullCommit(reference) {
  return commandOutput("git", ["rev-parse", reference]).toLowerCase();
}

function packageVersion() {
  const payload = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  return typeof payload.version === "string" ? payload.version : "";
}

function validProgress(value) {
  return value && value.status === "installing" && typeof value.fromCommit === "string" && typeof value.toCommit === "string";
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  if (process.platform === "win32" && existsSync(path)) unlinkSync(path);
  renameSync(temporary, path);
}

function writeAutoUpdateStatus(value) {
  if (!autoRestartParentPid) return;
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(autoUpdateStatusFile, `${JSON.stringify({ ...value, workerPid: process.pid, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function short(commit) {
  return commit.slice(0, 7);
}

function fail(message) {
  writeAutoUpdateStatus({ status: "failed", message });
  console.error(message);
  process.exit(1);
}
