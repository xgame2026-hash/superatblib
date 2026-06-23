import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

const ENV_FILE = resolve(process.cwd(), ".env");
const PACKAGE_FILE = resolve(process.cwd(), "package.json");
const BUILD_COMMIT_FILE = resolve(process.cwd(), ".superarb-build-commit");
const DEFAULT_GITHUB_REPOSITORY = "xgame2026-hash/superatblib";

type GithubVersionPayload = {
  ok: boolean;
  configured: boolean;
  currentVersion: string;
  latestVersion: string;
  currentCommit?: string;
  latestCommit?: string;
  isLatest: boolean;
  source?: string;
  message?: string;
};

export function handleGithubVersionRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith("/api/github-version")) return false;

  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "Method not allowed." });
    return true;
  }

  fetchGithubVersion()
    .then((payload) => json(res, 200, payload))
    .catch((error: unknown) => {
      json(res, 502, {
        ok: false,
        configured: false,
        currentVersion: readPackageVersion(),
        latestVersion: readPackageVersion(),
        currentCommit: readBuildCommit(),
        isLatest: true,
        message: error instanceof Error ? error.message : "GitHub version check failed.",
      });
    });

  return true;
}

async function fetchGithubVersion(): Promise<GithubVersionPayload> {
  const env = readEnv();
  const currentVersion = env.SUPERARB_VERSION?.trim() || readPackageVersion();
  const currentCommit = readBuildCommit();
  const directVersion = env.GITHUB_LATEST_VERSION?.trim();
  const latestUrl = env.GITHUB_LATEST_VERSION_URL?.trim();
  const repository = normalizeRepository(env.GITHUB_REPOSITORY?.trim() || env.GITHUB_REPO?.trim() || DEFAULT_GITHUB_REPOSITORY);

  if (directVersion) {
    const latestVersion = normalizeVersion(directVersion);
    return {
      ok: true,
      configured: true,
      currentVersion,
      latestVersion,
      currentCommit,
      isLatest: compareVersions(currentVersion, latestVersion) >= 0,
      source: "GITHUB_LATEST_VERSION",
    };
  }

  const sourceUrl = latestUrl || (repository ? `https://raw.githubusercontent.com/${repository}/main/package.json` : "");
  if (!sourceUrl) {
    return {
      ok: true,
      configured: false,
      currentVersion,
      latestVersion: currentVersion,
      currentCommit,
      isLatest: true,
      message: "未配置 GitHub 版本检测源",
    };
  }

  const text = await fetchVersionText(sourceUrl, repository);
  const latestVersion = normalizeVersion(readVersionFromPayload(text));
  const latestCommit = repository ? await fetchMainCommit(repository) : "";
  if (!latestVersion) {
    throw new Error("GitHub version API did not return a version.");
  }

  return {
    ok: true,
    configured: true,
    currentVersion,
    latestVersion,
    currentCommit,
    latestCommit,
    isLatest: isLatestBuild(currentVersion, latestVersion, currentCommit, latestCommit),
    source: sourceUrl,
  };
}

async function fetchMainCommit(repository: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/main`, {
    headers: {
      accept: "application/vnd.github+json, application/json",
      "user-agent": "SuperARB-dashboard",
    },
  });
  if (!response.ok) return "";
  const payload = (await response.json().catch(() => ({}))) as { sha?: unknown };
  if (typeof payload.sha === "string") return payload.sha.slice(0, 7);
  return "";
}

async function fetchVersionText(sourceUrl: string, repository: string): Promise<string> {
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "application/vnd.github+json, application/json, text/plain",
      "user-agent": "SuperARB-dashboard",
    },
  });
  if (response.ok) return response.text();

  if (!response.ok && repository) {
    const packageResponse = await fetch(`https://raw.githubusercontent.com/${repository}/main/package.json`, {
      headers: { accept: "application/json, text/plain", "user-agent": "SuperARB-dashboard" },
    });
    if (packageResponse.ok) return packageResponse.text();
  }

  throw new Error(`GitHub version API HTTP ${response.status}`);
}

function readVersionFromPayload(source: string): string {
  const text = source.trim();
  if (!text) return "";
  try {
    const payload = JSON.parse(text) as unknown;
    if (Array.isArray(payload)) {
      return readVersionFromObject(payload[0]);
    }
    return readVersionFromObject(payload);
  } catch {
    return text;
  }
}

function readVersionFromObject(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  for (const key of ["tag_name", "version", "latestVersion", "name"]) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  return "";
}

function normalizeRepository(source: string): string {
  if (!source) return "";
  return source.replace(/^https?:\/\/github\.com\//, "").replace(/^git@github\.com:/, "").replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
}

function normalizeVersion(source: string): string {
  return source.trim().replace(/^release[-_/]/i, "").replace(/^v/i, "");
}

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

function isLatestBuild(currentVersion: string, latestVersion: string, currentCommit: string, latestCommit: string): boolean {
  const versionCompare = compareVersions(currentVersion, latestVersion);
  if (versionCompare !== 0) return versionCompare > 0;
  if (currentCommit && latestCommit) return currentCommit === latestCommit;
  return true;
}

function versionParts(source: string): number[] {
  return normalizeVersion(source)
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function readPackageVersion(): string {
  try {
    const source = existsSync(PACKAGE_FILE) ? readFileSync(PACKAGE_FILE, "utf8") : "{}";
    const payload = JSON.parse(source) as { version?: string };
    return payload.version ?? "1.5.6";
  } catch {
    return "1.5.6";
  }
}

function readBuildCommit(): string {
  const configured = process.env.SUPERARB_BUILD_COMMIT?.trim();
  if (configured) return configured.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return existsSync(BUILD_COMMIT_FILE) ? readFileSync(BUILD_COMMIT_FILE, "utf8").trim().slice(0, 7) : "";
  }
}

function readEnv(): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return parsed;
  for (const rawLine of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    parsed[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return parsed;
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
