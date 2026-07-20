import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";

const RECEIPT_FILE = resolve(process.cwd(), ".superarb/update-completed.json");
const PACKAGE_FILE = resolve(process.cwd(), "package.json");
const AUTO_UPDATE_STATUS_FILE = resolve(process.cwd(), ".superarb/auto-update-status.json");
const UPDATE_CONTROLLER_FILE = resolve(process.cwd(), "scripts/update-controller.mjs");

type UpdateReceipt = {
  schemaVersion: number;
  receiptId: string;
  status: string;
  fromCommit: string;
  toCommit: string;
  fromVersion: string;
  toVersion: string;
  completedAt: string;
  buildVerified: boolean;
  healthCheckPassed: boolean;
  announcedAt: string | null;
};

export function handleUpdateCompletionRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
  if (!["/api/update-completion", "/api/update-completion/ack", "/api/automatic-update", "/api/automatic-update/status"].includes(pathname)) return false;

  if (pathname === "/api/automatic-update/status" && req.method === "GET") {
    json(res, 200, { ok: true, ...readAutomaticUpdateStatus() });
    return true;
  }

  if (pathname === "/api/automatic-update" && req.method === "POST") {
    if (!isSameOriginLocalRequest(req)) {
      json(res, 403, { ok: false, error: "自动升级请求必须来自当前本地面板。" });
      return true;
    }
    const current = readAutomaticUpdateStatus();
    if (["checking", "updating", "restarting"].includes(String(current.status)) && processAlive(Number(current.workerPid))) {
      json(res, 202, { ok: true, ...current });
      return true;
    }
    const child = spawn(process.execPath, [UPDATE_CONTROLLER_FILE], {
      cwd: process.cwd(),
      env: { ...process.env, SUPERARB_UPDATE_PARENT_PID: String(process.pid) },
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    writeAutomaticUpdateStatus({ status: "checking", workerPid: child.pid, message: "自动升级已启动。" });
    json(res, 202, { ok: true, status: "checking", workerPid: child.pid });
    return true;
  }

  if (pathname === "/api/update-completion" && req.method === "GET") {
    const receipt = readReceipt();
    const healthy = receipt !== null && receiptMatchesRuntime(receipt);
    json(res, 200, {
      ok: true,
      pending: healthy && !receipt.announcedAt,
      receipt: healthy ? { ...receipt, healthCheckPassed: true } : null,
    });
    return true;
  }

  if (pathname === "/api/update-completion/ack" && req.method === "POST") {
    readBody(req)
      .then((body) => {
        const payload = JSON.parse(body || "{}") as { receiptId?: unknown };
        const receipt = readReceipt();
        if (!receipt || !receiptMatchesRuntime(receipt)) return json(res, 409, { ok: false, error: "升级成功凭证与当前运行版本不匹配。" });
        if (payload.receiptId !== receipt.receiptId) return json(res, 409, { ok: false, error: "升级成功凭证已经变化。" });
        if (!receipt.announcedAt) {
          receipt.healthCheckPassed = true;
          receipt.announcedAt = new Date().toISOString();
          writeReceipt(receipt);
        }
        return json(res, 200, { ok: true, announcedAt: receipt.announcedAt });
      })
      .catch((error: unknown) => json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  json(res, 405, { ok: false, error: "Method not allowed." });
  return true;
}

function readAutomaticUpdateStatus(): Record<string, unknown> {
  try {
    const value = JSON.parse(readFileSync(AUTO_UPDATE_STATUS_FILE, "utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { status: "idle" };
  } catch {
    return { status: "idle" };
  }
}

function writeAutomaticUpdateStatus(value: Record<string, unknown>): void {
  mkdirSync(dirname(AUTO_UPDATE_STATUS_FILE), { recursive: true });
  writeFileSync(AUTO_UPDATE_STATUS_FILE, `${JSON.stringify({ ...value, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isSameOriginLocalRequest(req: IncomingMessage): boolean {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const host = typeof req.headers.host === "string" ? req.headers.host.toLowerCase() : "";
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return ["127.0.0.1", "localhost"].includes(url.hostname.toLowerCase()) && url.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function receiptMatchesRuntime(receipt: UpdateReceipt): boolean {
  if (receipt.status !== "success" || !receipt.buildVerified || !receipt.receiptId) return false;
  const currentCommit = runtimeCommit();
  const targetCommit = normalizeCommit(receipt.toCommit);
  if (!currentCommit || !targetCommit || !(currentCommit.startsWith(targetCommit) || targetCommit.startsWith(currentCommit))) return false;
  return receipt.toVersion === packageVersion();
}

function readReceipt(): UpdateReceipt | null {
  try {
    const value = JSON.parse(readFileSync(RECEIPT_FILE, "utf8")) as Partial<UpdateReceipt>;
    if (value.schemaVersion !== 1 || typeof value.receiptId !== "string" || typeof value.toCommit !== "string") return null;
    return value as UpdateReceipt;
  } catch {
    return null;
  }
}

function writeReceipt(receipt: UpdateReceipt): void {
  mkdirSync(dirname(RECEIPT_FILE), { recursive: true });
  const temporary = `${RECEIPT_FILE}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, RECEIPT_FILE);
}

function runtimeCommit(): string {
  const configured = process.env.SUPERARB_BUILD_COMMIT?.trim();
  if (configured) return normalizeCommit(configured);
  try {
    return normalizeCommit(execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return "";
  }
}

function packageVersion(): string {
  try {
    const payload = JSON.parse(existsSync(PACKAGE_FILE) ? readFileSync(PACKAGE_FILE, "utf8") : "{}") as { version?: unknown };
    return typeof payload.version === "string" ? payload.version : "";
  } catch {
    return "";
  }
}

function normalizeCommit(value: string): string {
  return value.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > 16_384) reject(new Error("Request body too large."));
    });
    req.on("end", () => resolveBody(body));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}
