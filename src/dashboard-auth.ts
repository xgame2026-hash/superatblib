import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";

type TextResponder = (
  res: ServerResponse,
  statusCode: number,
  body: string,
  contentType?: string,
) => void;

const COOKIE_NAME = "dashboard_auth";
const DEFAULT_LICENSE_CHECK_URL = "https://www.supermtnode.io/api/license/check";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const PROCESS_SESSION_SECRET = randomBytes(32).toString("base64url");

type LicenseCheckPayload = {
  ok?: unknown;
  valid?: unknown;
  status?: unknown;
  error?: unknown;
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

function licenseCheckUrl(): string {
  return (process.env.DASHBOARD_LICENSE_CHECK_URL ?? DEFAULT_LICENSE_CHECK_URL).trim();
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

async function verifyLicenseCode(code: string): Promise<{ valid: boolean; error?: string }> {
  if (!code) {
    return { valid: false, error: "Authorization code is required." };
  }

  let response: Response;
  try {
    response = await fetch(licenseCheckUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    return {
      valid: false,
      error: `Authorization service unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  let payload: LicenseCheckPayload;
  try {
    payload = (await response.json()) as LicenseCheckPayload;
  } catch {
    return { valid: false, error: "Authorization service returned an invalid response." };
  }

  if (!response.ok) {
    return {
      valid: false,
      error:
        typeof payload.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : `Authorization service rejected the request (${response.status}).`,
    };
  }

  if (payload.ok === true && payload.valid === true && payload.status === "active") {
    return { valid: true };
  }

  return {
    valid: false,
    error:
      typeof payload.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : "Authorization code is not active.",
  };
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
  const code = new URLSearchParams(body).get("code")?.trim() ?? "";
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
  const escapedError = error
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const version = authDisplayVersion()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return String.raw`<!doctype html>
<html lang="en">
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
      }
      p {
        margin: 0 0 22px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.5;
      }
      label {
        display: block;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 8px;
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
      .auth-error {
        min-height: 20px;
        margin-top: 12px;
        color: var(--red);
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main class="auth-panel">
      <div class="auth-logo">
        <img src="/img/supermini.png" alt="SuperARB" />
        <span class="auth-version">${version}</span>
      </div>
      <h1>Authorization Required</h1>
      <form method="post" action="/auth">
        <label for="code">Authorization Code</label>
        <input id="code" name="code" type="password" autocomplete="current-password" autofocus />
        <button type="submit">Enter Console</button>
      </form>
      <div class="auth-error">${escapedError}</div>
    </main>
  </body>
</html>`;
}
