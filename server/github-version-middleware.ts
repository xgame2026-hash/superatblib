import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isBuildCurrentOrNewer, normalizeVersionLabel as normalizeVersion } from "../src/github-version";
import { ENV_FILE } from "./runtime-paths";

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
      isLatest: isBuildCurrentOrNewer(currentVersion, latestVersion, currentCommit, ""),
      source: "GITHUB_LATEST_VERSION",
    };
  }

  const latestCommit = repository ? await fetchMainCommit(repository) : "";
  const sourceUrl = latestUrl || (repository ? `https://raw.githubusercontent.com/${repository}/${latestCommit || "main"}/package.json` : "");
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
  if (!latestVersion) {
    throw new Error("GitHub version API did not return a version.");
  }

  return {
    ok: true,
    configured: true,
    currentVersion,
    latestVersion,
    currentCommit,
    latestCommit: latestCommit.slice(0, 7),
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
  if (typeof payload.sha === "string") return payload.sha;
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

function isLatestBuild(currentVersion: string, latestVersion: string, currentCommit: string, latestCommit: string): boolean {
  return isBuildCurrentOrNewer(currentVersion, latestVersion, currentCommit, latestCommit);
}

function readPackageVersion(): string {
  try {
    const source = existsSync(PACKAGE_FILE) ? readFileSync(PACKAGE_FILE, "utf8") : "{}";
    const payload = JSON.parse(source) as { version?: string };
    return payload.version ?? "1.6.7";
  } catch {
    return "1.6.7";
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
