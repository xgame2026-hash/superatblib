import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import "./env.js";
import { marketDataPool } from "./market-data-db.js";

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), "migrations");
  const pool = marketDataPool();
  for (const fileName of readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(migrationsDir, fileName), "utf8");
    for (const statement of splitSqlStatements(sql)) {
      await pool.query(statement);
    }
  }
  await pool.end();
  console.log("market-data migration ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
