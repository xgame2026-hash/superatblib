import { randomBytes, createHash } from "node:crypto";

import "./env.js";
import { marketDataPool } from "./market-data-db.js";

function readArg(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function generatedCode(): string {
  return `IWORK-${randomBytes(18).toString("base64url").toUpperCase()}`;
}

function featurePayload(): Record<string, unknown> {
  const raw = readArg("features");
  if (!raw) {
    return {
      flashloan: true,
      liquidation: true,
    };
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const code = readArg("code") ?? generatedCode();
  const plan = readArg("plan") ?? "standard";
  const maxActivations = Math.max(1, Number(readArg("max-activations") ?? 1));
  const expiresAt = readArg("expires-at") ?? null;
  const features = featurePayload();
  await marketDataPool().execute(
    `INSERT INTO license_codes
       (code_hash, plan, status, max_activations, expires_at, features)
     VALUES (?, ?, 'active', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       plan = VALUES(plan),
       status = 'active',
       max_activations = VALUES(max_activations),
       expires_at = VALUES(expires_at),
       features = VALUES(features)`,
    [
      sha256(code),
      plan,
      maxActivations,
      expiresAt,
      JSON.stringify(features),
    ],
  );
  await marketDataPool().end();
  console.log(
    JSON.stringify(
      {
        ok: true,
        code,
        plan,
        maxActivations,
        expiresAt,
        features,
      },
      null,
      2,
    ),
  );
}

main().catch(async (error) => {
  try {
    await marketDataPool().end();
  } catch {
    // Ignore close errors after command failures.
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
