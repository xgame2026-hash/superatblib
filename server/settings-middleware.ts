import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const ENV_FILE = resolve(process.cwd(), ".env");
const ENV_EXAMPLE_FILE = resolve(process.cwd(), ".env.example");

type SettingsPayload = {
  env?: unknown;
};

export function handleSettingsRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith("/api/settings")) return false;

  if (req.method === "GET") {
    const envText = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
    const exampleText = existsSync(ENV_EXAMPLE_FILE) ? readFileSync(ENV_EXAMPLE_FILE, "utf8") : "";
    json(res, 200, {
      ok: true,
      file: ".env",
      path: ENV_FILE,
      template: ".env.example",
      templatePath: ENV_EXAMPLE_FILE,
      exists: existsSync(ENV_FILE),
      env: parseEnv(envText),
      example: parseEnv(exampleText),
    });
    return true;
  }

  if (req.method === "PUT") {
    readBody(req)
      .then((body) => {
        const payload = JSON.parse(body || "{}") as SettingsPayload;
        if (typeof payload.env !== "string") {
          json(res, 400, { ok: false, error: "Missing env text." });
          return;
        }
        writeFileSync(ENV_FILE, normalizeEnv(payload.env), "utf8");
        json(res, 200, { ok: true, file: ".env", path: ENV_FILE });
      })
      .catch((error: unknown) => {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  json(res, 405, { ok: false, error: "Method not allowed." });
  return true;
}

function parseEnv(source: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    parsed[line.slice(0, separator).trim()] = line.slice(separator + 1);
  }
  return parsed;
}

function normalizeEnv(source: string): string {
  return `${source.replace(/\r\n/g, "\n").trimEnd()}\n`;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolveBody(body));
    req.on("error", rejectBody);
  });
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
