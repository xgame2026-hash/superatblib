import { createHash } from "node:crypto";

import mysql, {
  type PoolOptions,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import { CHAIN_ALIASES, type ChainPreset } from "./config.js";
import {
  buildFlashloanOverview,
  buildLatestLiquidation,
  buildLiquidationLeaderboard,
  buildLiquidationOverview,
  type DashboardProviderContext,
  type FlashloanRow,
  type LiquidationRow,
  type OnchainSnapshot,
} from "./onchain-dashboard-provider.js";

type CursorRow = RowDataPacket & {
  chain: string;
  from_block: number | string | null;
  to_block: number | string | null;
  is_indexing: number;
  flashloan_rows: number;
  liquidation_rows: number;
  last_started_at: Date | string | null;
  last_completed_at: Date | string | null;
  last_error: string | null;
};

export type MarketDataCursor = {
  chain: string;
  fromBlock: number | null;
  toBlock: number | null;
  indexing: boolean;
  flashloanRows: number;
  liquidationRows: number;
  lastStartedAt: Date | string | null;
  lastCompletedAt: Date | string | null;
  lastError: string | null;
};

type FlashloanDbRow = RowDataPacket & {
  raw_json: string | Record<string, unknown>;
};

type LiquidationDbRow = RowDataPacket & {
  raw_json: string | Record<string, unknown>;
};

let pool: Pool | null = null;

export function marketDataDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return url;
}

export function marketDataPool(): Pool {
  if (!pool) {
    const url = new URL(databaseUrl());
    const configuredLimit = Number(url.searchParams.get("connection_limit"));
    pool = mysql.createPool({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      waitForConnections: true,
      connectionLimit: Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 10,
    } satisfies PoolOptions);
  }
  return pool;
}

function hashId(parts: unknown[]): string {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

function decimal(value: number): string {
  return Number.isFinite(value) ? value.toFixed(12) : "0.000000000000";
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function jsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (value && typeof value === "object") return value as T;
  return fallback;
}

function daysForPeriod(period: "1" | "7" | "30"): number {
  return period === "1" ? 1 : period === "30" ? 30 : 7;
}

function chainFromKey(value: string): ChainPreset | null {
  return CHAIN_ALIASES[value as keyof typeof CHAIN_ALIASES] ?? null;
}

function snapshotFromRows(
  context: DashboardProviderContext,
  flashloans: FlashloanRow[],
  liquidations: LiquidationRow[],
  cursor: CursorRow | null,
): OnchainSnapshot | null {
  const chain = chainFromKey(context.chain);
  const period = context.period ?? "30";
  if (!chain) return null;
  if (!flashloans.length && !liquidations.length) return null;
  const blockNumbers = [
    ...flashloans.map((row) => row.blockNumber),
    ...liquidations.map((row) => row.blockNumber),
  ].filter((value) => Number.isFinite(value) && value > 0);
  const updateTimestamp = Math.max(
    0,
    ...flashloans.map((row) => row.time),
    ...liquidations.map((row) => row.time),
  ) || null;
  return {
    chain,
    period,
    fetchedAt: new Date().toISOString(),
    updateTimestamp,
    fromBlock: numberValue(cursor?.from_block) || Math.min(...blockNumbers),
    toBlock: numberValue(cursor?.to_block) || Math.max(...blockNumbers),
    requestedBlocks: 0,
    scannedBlocks: 0,
    windowTruncated: false,
    protocolName: "Market Events",
    flashloans,
    liquidations,
  };
}

async function readCursor(chain: string): Promise<CursorRow | null> {
  const [rows] = await marketDataPool().execute<CursorRow[]>(
    `SELECT *
       FROM market_index_cursor
      WHERE chain = ? AND source_kind = 'aggregate' AND source_address = ''
      LIMIT 1`,
    [chain],
  );
  return rows[0] ?? null;
}

function mapCursor(row: CursorRow | null): MarketDataCursor | null {
  if (!row) return null;
  return {
    chain: row.chain,
    fromBlock: numberValue(row.from_block) || null,
    toBlock: numberValue(row.to_block) || null,
    indexing: Boolean(row.is_indexing),
    flashloanRows: row.flashloan_rows,
    liquidationRows: row.liquidation_rows,
    lastStartedAt: row.last_started_at,
    lastCompletedAt: row.last_completed_at,
    lastError: row.last_error,
  };
}

export async function readMarketDataCursor(chain: string): Promise<MarketDataCursor | null> {
  if (!marketDataDatabaseConfigured()) return null;
  return mapCursor(await readCursor(chain));
}

async function readFlashloanRows(chain: string, since: number): Promise<FlashloanRow[]> {
  const [rows] = await marketDataPool().execute<FlashloanDbRow[]>(
    `SELECT raw_json
       FROM market_flashloan_events
      WHERE chain = ? AND event_time >= ?
      ORDER BY event_time DESC, block_number DESC
      LIMIT 20000`,
    [chain, since],
  );
  return rows.map((row) => jsonValue<FlashloanRow>(row.raw_json, null as unknown as FlashloanRow)).filter(Boolean);
}

async function readLiquidationRows(chain: string, since: number): Promise<LiquidationRow[]> {
  const [rows] = await marketDataPool().execute<LiquidationDbRow[]>(
    `SELECT raw_json
       FROM market_liquidation_events
      WHERE chain = ? AND event_time >= ?
      ORDER BY event_time DESC, block_number DESC
      LIMIT 20000`,
    [chain, since],
  );
  return rows.map((row) => jsonValue<LiquidationRow>(row.raw_json, null as unknown as LiquidationRow)).filter(Boolean);
}

export async function fetchDatabaseMarketDataPayload(
  context: DashboardProviderContext,
): Promise<Record<string, unknown> | null> {
  if (!marketDataDatabaseConfigured()) return null;
  const chain = chainFromKey(context.chain);
  if (!chain) return null;
  const period = context.period ?? "30";
  const since = Math.floor(Date.now() / 1000) - daysForPeriod(period) * 86_400;
  const [cursor, flashloans, liquidations] = await Promise.all([
    readCursor(chain.key),
    context.key === "flashloan-overview" ? readFlashloanRows(chain.key, since) : Promise.resolve([]),
    context.key !== "flashloan-overview" ? readLiquidationRows(chain.key, since) : Promise.resolve([]),
  ]);
  const snapshot = snapshotFromRows(context, flashloans, liquidations, cursor);
  if (!snapshot) return null;
  if (context.key === "flashloan-overview") return buildFlashloanOverview(snapshot);
  if (context.key === "liquidation-overview") return buildLiquidationOverview(snapshot);
  if (context.key === "liquidation-leaderboard") return buildLiquidationLeaderboard(snapshot);
  return buildLatestLiquidation(snapshot, context);
}

export async function beginMarketDataIndexRun(chain: string, period: string): Promise<number | null> {
  if (!marketDataDatabaseConfigured()) return null;
  await marketDataPool().execute(
    `INSERT INTO market_index_cursor
       (chain, source_kind, source_label, source_address, is_indexing, last_started_at, last_error)
     VALUES (?, 'aggregate', 'Market Events', '', 1, UTC_TIMESTAMP(), NULL)
     ON DUPLICATE KEY UPDATE
       is_indexing = 1,
       last_started_at = UTC_TIMESTAMP(),
       last_error = NULL`,
    [chain],
  );
  const [result] = await marketDataPool().execute<ResultSetHeader>(
    `INSERT INTO market_index_runs (chain, period, started_at, ok)
     VALUES (?, ?, UTC_TIMESTAMP(), 0)`,
    [chain, period],
  );
  return result.insertId || null;
}

export async function failMarketDataIndexRun(
  chain: string,
  runId: number | null,
  error: unknown,
): Promise<void> {
  if (!marketDataDatabaseConfigured()) return;
  const message = error instanceof Error ? error.message : String(error);
  await marketDataPool().execute(
    `INSERT INTO market_index_cursor
       (chain, source_kind, source_label, source_address, is_indexing, last_error)
     VALUES (?, 'aggregate', 'Market Events', '', 0, ?)
     ON DUPLICATE KEY UPDATE
       is_indexing = 0,
       last_error = VALUES(last_error)`,
    [chain, message.slice(0, 2000)],
  );
  if (runId) {
    await marketDataPool().execute(
      `UPDATE market_index_runs
          SET completed_at = UTC_TIMESTAMP(), ok = 0, error = ?
        WHERE id = ?`,
      [message.slice(0, 2000), runId],
    );
  }
}

async function upsertHourlyStats(snapshot: OnchainSnapshot): Promise<void> {
  const buckets = new Map<string, {
    chain: string;
    eventType: string;
    protocol: string;
    bucketStart: number;
    txCount: number;
    amountUsd: number;
    feeUsd: number;
    profitUsd: number;
  }>();
  function add(eventType: string, protocol: string, time: number, values: {
    amountUsd?: number;
    feeUsd?: number;
    profitUsd?: number;
  }): void {
    const bucketStart = Math.floor(time / 3600) * 3600;
    const statId = hashId([snapshot.chain.key, eventType, protocol, bucketStart]);
    const bucket = buckets.get(statId) ?? {
      chain: snapshot.chain.key,
      eventType,
      protocol,
      bucketStart,
      txCount: 0,
      amountUsd: 0,
      feeUsd: 0,
      profitUsd: 0,
    };
    bucket.txCount += 1;
    bucket.amountUsd += values.amountUsd ?? 0;
    bucket.feeUsd += values.feeUsd ?? 0;
    bucket.profitUsd += values.profitUsd ?? 0;
    buckets.set(statId, bucket);
  }
  for (const row of snapshot.flashloans) {
    add("flashloan", row.protocol, row.time, { amountUsd: row.amount, feeUsd: row.fee });
  }
  for (const row of snapshot.liquidations) {
    add("liquidation", row.protocol, row.time, {
      amountUsd: row.liquidationAmount,
      profitUsd: row.profit,
    });
  }
  for (const [statId, row] of buckets) {
    await marketDataPool().execute(
      `INSERT INTO market_hourly_stats
         (stat_id, chain, event_type, protocol, bucket_start, tx_count, amount_usd, fee_usd, profit_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tx_count = VALUES(tx_count),
         amount_usd = VALUES(amount_usd),
         fee_usd = VALUES(fee_usd),
         profit_usd = VALUES(profit_usd)`,
      [
        statId,
        row.chain,
        row.eventType,
        row.protocol,
        row.bucketStart,
        row.txCount,
        decimal(row.amountUsd),
        decimal(row.feeUsd),
        decimal(row.profitUsd),
      ],
    );
  }
}

export async function writeMarketDataSnapshotToDatabase(
  snapshot: OnchainSnapshot,
  runId: number | null = null,
): Promise<void> {
  if (!marketDataDatabaseConfigured()) return;
  const existingCursor = await readMarketDataCursor(snapshot.chain.key);
  for (const row of snapshot.flashloans) {
    const eventId = hashId([
      snapshot.chain.key,
      "flashloan",
      row.txHash,
      row.blockNumber,
      row.protocol,
      row.purpose,
      row.borrower,
      row.asset,
      row.amount,
      row.fee,
    ]);
    await marketDataPool().execute(
      `INSERT INTO market_flashloan_events
         (event_id, chain, protocol, purpose, block_number, event_time, tx_hash, borrower, asset,
          amount_usd, fee_usd, token_count, lp_count, legs_json, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
          protocol = VALUES(protocol),
          purpose = VALUES(purpose),
          event_time = VALUES(event_time),
          amount_usd = VALUES(amount_usd),
          fee_usd = VALUES(fee_usd),
          token_count = VALUES(token_count),
          lp_count = VALUES(lp_count),
          legs_json = VALUES(legs_json),
          raw_json = VALUES(raw_json)`,
      [
        eventId,
        snapshot.chain.key,
        row.protocol,
        row.purpose,
        row.blockNumber,
        row.time,
        row.txHash,
        row.borrower,
        row.asset,
        decimal(row.amount),
        decimal(row.fee),
        row.tokenCount,
        row.lpCount,
        JSON.stringify(row.legs),
        JSON.stringify(row),
      ],
    );
  }
  for (const row of snapshot.liquidations) {
    const eventId = hashId([
      snapshot.chain.key,
      "liquidation",
      row.txHash,
      row.blockNumber,
      row.borrower,
      row.liquidator,
      row.debtAsset,
      row.liquidationAsset,
      row.debtToCover,
      row.liquidationAmount,
    ]);
    await marketDataPool().execute(
      `INSERT INTO market_liquidation_events
         (event_id, chain, protocol, block_number, event_time, tx_hash, borrower, liquidator,
          debt_asset, debt_to_cover_usd, debt_quantity, liquidation_asset, liquidation_amount_usd,
          liquidation_quantity, profit_usd, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
          protocol = VALUES(protocol),
          event_time = VALUES(event_time),
          debt_to_cover_usd = VALUES(debt_to_cover_usd),
          debt_quantity = VALUES(debt_quantity),
          liquidation_amount_usd = VALUES(liquidation_amount_usd),
          liquidation_quantity = VALUES(liquidation_quantity),
          profit_usd = VALUES(profit_usd),
          raw_json = VALUES(raw_json)`,
      [
        eventId,
        snapshot.chain.key,
        row.protocol,
        row.blockNumber,
        row.time,
        row.txHash,
        row.borrower,
        row.liquidator,
        row.debtAsset,
        decimal(row.debtToCover),
        decimal(row.debtQuantity),
        row.liquidationAsset,
        decimal(row.liquidationAmount),
        decimal(row.liquidationQuantity),
        decimal(row.profit),
        JSON.stringify(row),
      ],
    );
  }
  await upsertHourlyStats(snapshot);
  const [flashloanCountRows] = await marketDataPool().execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM market_flashloan_events WHERE chain = ?`,
    [snapshot.chain.key],
  );
  const [liquidationCountRows] = await marketDataPool().execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM market_liquidation_events WHERE chain = ?`,
    [snapshot.chain.key],
  );
  const totalFlashloanRows = numberValue(flashloanCountRows[0]?.count);
  const totalLiquidationRows = numberValue(liquidationCountRows[0]?.count);
  const storedFromBlock = existingCursor?.fromBlock
    ? Math.min(existingCursor.fromBlock, snapshot.fromBlock)
    : snapshot.fromBlock;
  await marketDataPool().execute(
    `INSERT INTO market_index_cursor
       (chain, source_kind, source_label, source_address, from_block, to_block, target_block,
        is_indexing, flashloan_rows, liquidation_rows, last_completed_at, last_error)
     VALUES (?, 'aggregate', 'Market Events', '', ?, ?, ?, 0, ?, ?, UTC_TIMESTAMP(), NULL)
     ON DUPLICATE KEY UPDATE
       from_block = VALUES(from_block),
       to_block = VALUES(to_block),
       target_block = VALUES(target_block),
       is_indexing = 0,
       flashloan_rows = VALUES(flashloan_rows),
       liquidation_rows = VALUES(liquidation_rows),
       last_completed_at = UTC_TIMESTAMP(),
       last_error = NULL`,
    [
      snapshot.chain.key,
      storedFromBlock,
      snapshot.toBlock,
      snapshot.toBlock,
      totalFlashloanRows,
      totalLiquidationRows,
    ],
  );
  if (runId) {
    await marketDataPool().execute(
      `UPDATE market_index_runs
          SET from_block = ?, to_block = ?, flashloan_rows = ?, liquidation_rows = ?,
              completed_at = UTC_TIMESTAMP(), ok = 1, error = NULL
        WHERE id = ?`,
      [
        snapshot.fromBlock,
        snapshot.toBlock,
        snapshot.flashloans.length,
        snapshot.liquidations.length,
        runId,
      ],
    );
  }
}

export async function databaseMarketDataIndexStatus(): Promise<Record<string, unknown> | null> {
  if (!marketDataDatabaseConfigured()) return null;
  const [cursorRows] = await marketDataPool().execute<CursorRow[]>(
    `SELECT *
       FROM market_index_cursor
      ORDER BY chain ASC, source_kind ASC`,
  );
  return {
    ok: true,
    provider: "mysql-market-events",
    indexing: cursorRows.some((row) => Boolean(row.is_indexing)),
    indexes: cursorRows.map((row) => ({
      chain: row.chain,
      sourceKind: "aggregate",
      sourceLabel: "Market Events",
      exists: true,
      fileSizeBytes: 0,
      fromBlock: numberValue(row.from_block) || null,
      toBlock: numberValue(row.to_block) || null,
      indexing: Boolean(row.is_indexing),
      flashloanRows: row.flashloan_rows,
      liquidationRows: row.liquidation_rows,
      sources: [{ kind: "mysql", label: "MySQL", address: null }],
      lastStartedAt: row.last_started_at,
      lastCompletedAt: row.last_completed_at,
      lastError: row.last_error,
    })),
  };
}
