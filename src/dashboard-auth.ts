import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";

type TextResponder = (
  res: ServerResponse,
  statusCode: number,
  body: string,
  contentType?: string,
) => void;

const COOKIE_NAME = "dashboard_auth";
const DEFAULT_LICENSE_CHECK_URLS = [
  "https://superarb.ai/api/license/check",
  "https://www.supermtnode.io/api/license/check",
  "https://supermtnode.io/api/license/check",
];
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const PROCESS_SESSION_SECRET = randomBytes(32).toString("base64url");
const AUTH_CODE_EXAMPLE = "SMT-XXXX-XXXX-XXXX-XXXX";
const AUTH_CODE_PATTERN = /^SMT-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/i;

type LicenseCheckPayload = {
  ok?: unknown;
  valid?: unknown;
  status?: unknown;
  error?: unknown;
};

type LicenseCheckResponse = {
  ok: boolean;
  status: number;
  payload: LicenseCheckPayload;
};

type DashboardAuthResult = {
  authorized: boolean;
  error?: string;
};

function sessionSecret(): string {
  const baseSecret =
    process.env.DASHBOARD_AUTH_SECRET ??
    process.env.DASHBOARD_SESSION_SECRET ??
    "dashboard-auth-session";
  return `${baseSecret}:${PROCESS_SESSION_SECRET}`;
}

function licenseCheckUrls(): string[] {
  const configured = process.env.DASHBOARD_LICENSE_CHECK_URL?.trim();
  const urls = configured
    ? configured.split(",").map((url) => url.trim()).filter(Boolean)
    : DEFAULT_LICENSE_CHECK_URLS;
  return [...new Set(urls)];
}

function packageVersion(): string {
  try {
    const payload = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;
    return typeof payload.version === "string" && payload.version.trim()
      ? payload.version.trim()
      : "unknown";
  } catch {
    return "unknown";
  }
}

function currentGitCommitSha(): string | null {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return sha || null;
  } catch {
    return null;
  }
}

function authDisplayVersion(): string {
  const version = packageVersion();
  const sha = currentGitCommitSha();
  return sha ? `v${version}+${sha.slice(0, 7)}` : `v${version}`;
}

function signSession(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function encodeSessionCode(code: string): string {
  return Buffer.from(code, "utf8").toString("base64url");
}

function decodeSessionCode(encoded: string): string | null {
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const raw = Array.isArray(header) ? header.join(";") : header ?? "";
  return raw.split(";").reduce<Record<string, string>>((cookies, part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return cookies;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }
    return cookies;
  }, {});
}

function createSessionCookie(code: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${expiresAt}.${encodeSessionCode(code)}`;
  const token = `${payload}.${signSession(payload)}`;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function normalizeAuthorizationCode(code: string): string {
  return code.trim().toUpperCase();
}

function isAuthorizationCodeFormatValid(code: string): boolean {
  return AUTH_CODE_PATTERN.test(normalizeAuthorizationCode(code));
}

async function verifyLicenseCode(code: string): Promise<{ valid: boolean; error?: string }> {
  const normalizedCode = normalizeAuthorizationCode(code);
  if (!normalizedCode) {
    return { valid: false, error: "Authorization code is required." };
  }
  if (!isAuthorizationCodeFormatValid(normalizedCode)) {
    return { valid: false, error: "Authorization code format is invalid." };
  }

  const transportErrors: string[] = [];

  for (const url of licenseCheckUrls()) {
    let response: LicenseCheckResponse;
    try {
      response = await postLicenseCheck(url, normalizedCode);
    } catch (error) {
      transportErrors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const { payload } = response;

    if (!response.ok) {
      return {
        valid: false,
        error:
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error.trim()
            : response.status === 404
              ? "Authorization code not found."
            : `Authorization service rejected the request (${response.status}).`,
      };
    }

    if (payload.ok === true && payload.valid === true && payload.status === "active") {
      return { valid: true };
    }

    return {
      valid: false,
      error: inactiveAuthorizationError(payload),
    };
  }

  return {
    valid: false,
    error: `Authorization service unavailable. Tried ${transportErrors.join("; ")}`,
  };
}

function inactiveAuthorizationError(payload: LicenseCheckPayload): string {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }
  if (typeof payload.status === "string" && payload.status.trim()) {
    const status = payload.status.trim().toLowerCase();
    if (status === "missing" || status === "not_found" || status === "not-found") {
      return "Authorization code not found.";
    }
    if (status === "expired") return "Authorization code expired.";
    if (status === "inactive" || status === "revoked" || status === "disabled") {
      return "Authorization code is not active.";
    }
  }
  return "Authorization code is not active.";
}

async function postLicenseCheck(url: string, code: string): Promise<LicenseCheckResponse> {
  try {
    return await postLicenseCheckWithFetch(url, code);
  } catch (fetchError) {
    try {
      return await postLicenseCheckWithHttps(url, code);
    } catch (httpsError) {
      const left = fetchError instanceof Error ? fetchError.message : String(fetchError);
      const right = httpsError instanceof Error ? httpsError.message : String(httpsError);
      throw new Error(`fetch failed (${left}); https fallback failed (${right})`);
    }
  }
}

async function postLicenseCheckWithFetch(url: string, code: string): Promise<LicenseCheckResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `SuperARB/${packageVersion()} license-check`,
    },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(10000),
  });
  let payload: LicenseCheckPayload;
  try {
    payload = (await response.json()) as LicenseCheckPayload;
  } catch {
    throw new Error("invalid response");
  }
  return { ok: response.ok, status: response.status, payload };
}

function postLicenseCheckWithHttps(url: string, code: string): Promise<LicenseCheckResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ code });
    const target = new URL(url);
    const req = httpsRequest(
      target,
      {
        method: "POST",
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": `SuperARB/${packageVersion()} license-check`,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          try {
            const raw = Buffer.concat(chunks).toString("utf8");
            const payload = JSON.parse(raw) as LicenseCheckPayload;
            resolve({
              ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
              status: res.statusCode ?? 0,
              payload,
            });
          } catch {
            reject(new Error("invalid response"));
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function parseSessionCode(req: IncomingMessage): string | null {
  const token = parseCookies(req.headers?.cookie)[COOKIE_NAME];
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  const code = decodeSessionCode(parts[2]);
  if (!code) return null;
  const payload = `${parts[0]}.${parts[1]}.${parts[2]}`;
  if (!secureEqual(signSession(payload), parts[3])) return null;
  return code;
}

export async function requireDashboardAuth(req: IncomingMessage): Promise<DashboardAuthResult> {
  const code = parseSessionCode(req);
  if (!code) {
    return { authorized: false, error: "Authorization required." };
  }

  const license = await verifyLicenseCode(code);
  if (!license.valid) {
    return {
      authorized: false,
      error: license.error ?? "Authorization code is invalid.",
    };
  }

  return { authorized: true };
}

export function isDashboardAuthRoute(pathname: string): boolean {
  return pathname === "/auth" || pathname === "/auth/logout";
}

export function serveDashboardAuthPage(
  res: ServerResponse,
  text: TextResponder,
  error = "",
): void {
  text(res, 200, dashboardAuthPage(error), "text/html; charset=utf-8");
}

export async function handleDashboardAuthRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  deps: {
    readBody: (req: IncomingMessage) => Promise<string>;
    text: TextResponder;
  },
): Promise<void> {
  if (pathname === "/auth/logout") {
    res.statusCode = 302;
    res.setHeader("set-cookie", clearSessionCookie());
    res.setHeader("location", "/auth");
    res.end();
    return;
  }

  if (req.method !== "POST") {
    serveDashboardAuthPage(res, deps.text);
    return;
  }

  const body = await deps.readBody(req);
  const code = normalizeAuthorizationCode(new URLSearchParams(body).get("code") ?? "");
  const license = await verifyLicenseCode(code);
  if (!license.valid) {
    serveDashboardAuthPage(res, deps.text, license.error ?? "Authorization code is invalid.");
    return;
  }

  res.statusCode = 302;
  res.setHeader("set-cookie", createSessionCookie(code));
  res.setHeader("location", "/");
  res.end();
}

function dashboardAuthPage(error: string): string {
  const hasError = Boolean(error);
  const statusMessage = translateAuthStatus(error);
  const escapedStatusMessage = statusMessage
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const version = authDisplayVersion()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SuperARB</title>
    <meta name="application-name" content="SuperARB" />
    <meta name="apple-mobile-web-app-title" content="SuperARB" />
    <meta name="theme-color" content="#101214" />
    <link rel="icon" type="image/png" sizes="192x192" href="/img/SuperARB_icon_192.png?v=20260507" />
    <link rel="icon" type="image/png" sizes="512x512" href="/img/SuperARB_icon_512.png?v=20260507" />
    <link rel="shortcut icon" href="/favicon.ico?v=20260507" />
    <link rel="apple-touch-icon" sizes="180x180" href="/img/SuperARB_icon_192.png?v=20260507" />
    <link rel="manifest" href="/manifest.webmanifest?v=20260507" />
    <style>
      :root {
        --bg: #101214;
        --panel: #1a1d22;
        --border: rgba(255,255,255,0.1);
        --text: #f5f7fa;
        --muted: #9ca5b3;
        --purple: #8a7dff;
        --green: #69f0ae;
        --red: #ff7a7a;
      }
      * { box-sizing: border-box; }
      html, body {
        height: 100%;
        margin: 0;
        background: #101214;
        color: var(--text);
        font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
      }
      body {
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .auth-panel {
        width: min(420px, 100%);
        border: 1px solid var(--border);
        background: var(--panel);
        border-radius: 8px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.34);
        padding: 28px;
      }
      .auth-logo {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 24px;
      }
      .auth-logo img {
        width: 150px;
        height: 37px;
        object-fit: contain;
      }
      .auth-version {
        border: 1px solid rgba(255,255,255,0.7);
        border-radius: 4px;
        color: rgba(255,255,255,0.9);
        font-size: 12px;
        font-weight: 700;
        padding: 3px 8px;
        white-space: nowrap;
      }
      .auth-chip {
        border: 1px solid rgba(255,255,255,0.7);
        border-radius: 3px;
        color: rgba(255,255,255,0.9);
        font-size: 12px;
        padding: 2px 7px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 24px;
        line-height: 1.2;
        letter-spacing: 0;
        text-align: center;
      }
      label {
        display: block;
        color: var(--muted);
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .auth-status {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        min-height: 28px;
        margin: 0 0 10px;
        color: var(--muted);
        font-size: 13px;
      }
      .auth-status strong {
        color: var(--text);
        font-size: 13px;
        font-weight: 700;
        line-height: 1.35;
        text-align: left;
      }
      .auth-status.is-error strong {
        color: var(--red);
      }
      input {
        width: 100%;
        height: 46px;
        border-radius: 5px;
        border: 1px solid var(--border);
        background: #111418;
        color: var(--text);
        outline: none;
        padding: 0 13px;
        font: inherit;
      }
      input:focus {
        border-color: rgba(138,125,255,0.75);
        box-shadow: 0 0 0 3px rgba(138,125,255,0.14);
      }
      .remember-row {
        display: flex;
        align-items: center;
        gap: 9px;
        margin: 12px 0 0;
        color: var(--muted);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        user-select: none;
      }
      .remember-row input {
        width: 16px;
        height: 16px;
        margin: 0;
        accent-color: var(--purple);
        cursor: pointer;
      }
      button {
        width: 100%;
        height: 48px;
        margin-top: 14px;
        border-radius: 5px;
        border: 1px solid rgba(138,125,255,0.55);
        background: linear-gradient(180deg, rgba(138,125,255,0.24), rgba(109,98,232,0.18));
        color: var(--text);
        cursor: pointer;
        font-weight: 700;
      }
      button:hover {
        border-color: rgba(105,240,174,0.55);
      }
    </style>
  </head>
  <body>
    <main class="auth-panel">
      <div class="auth-logo">
        <img src="/img/supermini.png" alt="SuperARB" />
        <span class="auth-version">${version}</span>
      </div>
      <h1>授权码登录</h1>
      <form id="authForm" method="post" action="/auth">
        <div class="auth-status${hasError ? " is-error" : ""}" id="authStatus" data-error="${hasError ? "1" : ""}">
          <strong>${escapedStatusMessage}</strong>
        </div>
        <input
          id="code"
          name="code"
          type="password"
          autocomplete="current-password"
          placeholder="${AUTH_CODE_EXAMPLE}"
          maxlength="23"
          spellcheck="false"
          autofocus
        />
        <label class="remember-row" for="rememberCode">
          <input id="rememberCode" name="rememberCode" type="checkbox" />
          <span>保存授权码</span>
        </label>
        <button type="submit">进入控制台</button>
      </form>
    </main>
    <script>
      (() => {
        const storageKey = "superarb-auth-code";
        const codePattern = /^SMT-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/i;
        const invalidFormatMessage = "请输入正确的授权码";
        const form = document.getElementById("authForm");
        const codeInput = document.getElementById("code");
        const rememberInput = document.getElementById("rememberCode");
        const authStatus = document.getElementById("authStatus");
        const status = authStatus?.querySelector("strong");
        if (!form || !codeInput || !rememberInput) return;

        const readSavedCode = () => {
          try {
            return localStorage.getItem(storageKey) || "";
          } catch {
            return "";
          }
        };
        const writeSavedCode = (code) => {
          try {
            if (code) {
              localStorage.setItem(storageKey, code);
            } else {
              localStorage.removeItem(storageKey);
            }
          } catch {}
        };

        const savedCode = readSavedCode();
        if (savedCode) {
          codeInput.value = savedCode.trim().toUpperCase();
          rememberInput.checked = true;
          if (status && !authStatus?.dataset.error) {
            status.textContent = "已加载保存的授权码";
          }
        }
        form.addEventListener("submit", (event) => {
          const code = codeInput.value.trim().toUpperCase();
          if (!code) {
            event.preventDefault();
            authStatus?.classList.add("is-error");
            if (status) status.textContent = "请输入授权码";
            return;
          }
          if (!codePattern.test(code)) {
            event.preventDefault();
            writeSavedCode("");
            authStatus?.classList.add("is-error");
            if (status) status.textContent = invalidFormatMessage;
            return;
          }
          codeInput.value = code;
          writeSavedCode(rememberInput.checked ? code : "");
          authStatus?.classList.remove("is-error");
          if (status) status.textContent = "正在验证授权码";
        });
      })();
    </script>
  </body>
</html>`;
}

function translateAuthStatus(error: string): string {
  if (!error) return "请输入授权码";
  const normalized = error.toLowerCase();
  if (error === "Authorization required.") return "请输入授权码";
  if (error === "Authorization code is required.") return "请输入授权码";
  if (error === "Authorization code format is invalid.") {
    return "请输入正确的授权码";
  }
  if (error === "Authorization code not found.") return "授权码不存在";
  if (error === "Authorization code is invalid.") {
    return "请输入正确的授权码";
  }
  if (error === "Authorization code is not active.") return "授权码已失效";
  if (error === "Authorization code expired.") return "授权码已失效";
  if (normalized.includes("not found") || normalized.includes("not exist")) {
    return "授权码不存在";
  }
  if (
    normalized.includes("not active") ||
    normalized.includes("expired") ||
    normalized.includes("revoked") ||
    normalized.includes("disabled")
  ) {
    return "授权码已失效";
  }
  if (normalized.includes("invalid")) return "请输入正确的授权码";
  if (normalized.includes("unavailable")) return "授权服务暂时不可用，请稍后重试";
  if (normalized.includes("rejected")) return "授权服务拒绝了本次请求";
  return error;
}
