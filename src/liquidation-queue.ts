import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type LiquidationQueueStatusRequest = {
  chain?: unknown;
  market?: unknown;
  walletAddress?: unknown;
  endpointSlug?: unknown;
  rpcEnv?: unknown;
  requestCount?: unknown;
  requestLimit?: unknown;
  remainingRequests?: unknown;
  eligible?: unknown;
  reason?: unknown;
  generatedAt?: unknown;
};

export type LiquidationQueueEventRequest = {
  chain?: unknown;
  market?: unknown;
  walletAddress?: unknown;
  endpointSlug?: unknown;
  outcome?: unknown;
  reason?: unknown;
  generatedAt?: unknown;
};

type QueueMember = {
  walletAddress: string;
  endpointSlug?: string;
  rpcEnv?: string;
  requestCount?: number | null;
  requestLimit?: number | null;
  remainingRequests?: number | null;
  joinedAt: string;
  lastSeenAt: string;
  lastOutcome?: string;
  lastReason?: string;
};

type QueueLease = {
  walletAddress: string;
  expiresAt: string;
};

type QueueRecord = {
  key: string;
  chain: string;
  market: string;
  members: QueueMember[];
  lease?: QueueLease;
};

type QueueState = {
  version: 1;
  queues: Record<string, QueueRecord>;
};

export type LiquidationQueueOptions = {
  stateFile?: string;
  memberTtlMs?: number;
  leaseMs?: number;
  now?: () => Date;
};

export type LiquidationQueueResponse = {
  ok: boolean;
  source: "liquidation-queue-server";
  generatedAt: string;
  chain: string;
  market: string;
  walletAddress: string | null;
  eligible: boolean;
  reason?: string;
  queue: {
    enabled: true;
    status: "registered" | "excluded" | "execute" | "wait_turn" | "rotated";
    action: "execute" | "wait_turn" | "excluded" | "rotated";
    position: number;
    size: number;
    currentWalletAddress?: string;
    leaseExpiresAt?: string;
  };
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1;
}

function queueKey(chain: string, market: string): string {
  return `${chain}:${market}`;
}

function defaultStateFile(): string {
  return path.resolve(process.cwd(), ".superarb", "liquidation-queue.json");
}

function loadState(filePath: string): QueueState {
  if (!existsSync(filePath)) {
    return { version: 1, queues: {} };
  }
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as Partial<QueueState>;
  return {
    version: 1,
    queues: raw.queues && typeof raw.queues === "object" ? raw.queues as Record<string, QueueRecord> : {},
  };
}

function saveState(filePath: string, state: QueueState): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export class LiquidationQueueStore {
  private readonly stateFile: string;
  private readonly memberTtlMs: number;
  private readonly leaseMs: number;
  private readonly now: () => Date;
  private state: QueueState;

  constructor(options: LiquidationQueueOptions = {}) {
    this.stateFile = options.stateFile ?? defaultStateFile();
    this.memberTtlMs = options.memberTtlMs ?? 120_000;
    this.leaseMs = options.leaseMs ?? 45_000;
    this.now = options.now ?? (() => new Date());
    this.state = loadState(this.stateFile);
  }

  status(input: LiquidationQueueStatusRequest): LiquidationQueueResponse {
    const generatedAt = this.now().toISOString();
    const chain = optionalString(input.chain) ?? "ethereum";
    const market = optionalString(input.market) ?? `aave-v3-${chain}`;
    const walletAddress = optionalString(input.walletAddress);
    const eligible = truthy(input.eligible);
    const reason = optionalString(input.reason);

    const record = this.queueFor(chain, market);
    this.prune(record);

    if (!walletAddress || !eligible) {
      if (walletAddress) this.remove(record, walletAddress);
      this.persist();
      return this.response(record, walletAddress ?? null, false, reason ?? "Wallet is not eligible.", "excluded");
    }

    const member = this.upsertMember(record, walletAddress, input);
    member.lastSeenAt = generatedAt;
    this.refreshLease(record, walletAddress);
    this.persist();

    const position = this.position(record, walletAddress);
    const isCurrent = position === 1;
    return this.response(record, walletAddress, true, undefined, isCurrent ? "execute" : "wait_turn");
  }

  event(input: LiquidationQueueEventRequest): LiquidationQueueResponse {
    const chain = optionalString(input.chain) ?? "ethereum";
    const market = optionalString(input.market) ?? `aave-v3-${chain}`;
    const walletAddress = optionalString(input.walletAddress);
    const outcome = optionalString(input.outcome) ?? "unknown";
    const reason = optionalString(input.reason);
    const record = this.queueFor(chain, market);
    this.prune(record);

    if (!walletAddress) {
      this.persist();
      return this.response(record, null, false, "Missing wallet address.", "excluded");
    }

    const member = record.members.find((entry) => entry.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (!member) {
      this.persist();
      return this.response(record, walletAddress, false, "Wallet is not in queue.", "excluded");
    }

    member.lastOutcome = outcome;
    member.lastReason = reason;
    member.lastSeenAt = this.now().toISOString();
    this.rotateToBack(record, walletAddress);
    delete record.lease;
    this.persist();
    return this.response(record, walletAddress, true, reason, "rotated");
  }

  snapshot(): QueueState {
    for (const record of Object.values(this.state.queues)) {
      this.prune(record);
    }
    this.persist();
    return JSON.parse(JSON.stringify(this.state)) as QueueState;
  }

  private queueFor(chain: string, market: string): QueueRecord {
    const key = queueKey(chain, market);
    const existing = this.state.queues[key];
    if (existing) return existing;
    const created: QueueRecord = { key, chain, market, members: [] };
    this.state.queues[key] = created;
    return created;
  }

  private upsertMember(
    record: QueueRecord,
    walletAddress: string,
    input: LiquidationQueueStatusRequest,
  ): QueueMember {
    const existing = record.members.find((entry) => entry.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    const member = existing ?? {
      walletAddress,
      joinedAt: this.now().toISOString(),
      lastSeenAt: this.now().toISOString(),
    };
    member.endpointSlug = optionalString(input.endpointSlug);
    member.rpcEnv = optionalString(input.rpcEnv);
    member.requestCount = optionalNumber(input.requestCount);
    member.requestLimit = optionalNumber(input.requestLimit);
    member.remainingRequests = optionalNumber(input.remainingRequests);
    if (!existing) record.members.push(member);
    return member;
  }

  private prune(record: QueueRecord): void {
    const cutoff = this.now().getTime() - this.memberTtlMs;
    record.members = record.members.filter((member) => new Date(member.lastSeenAt).getTime() >= cutoff);
    if (record.lease) {
      const leaseExpired = new Date(record.lease.expiresAt).getTime() <= this.now().getTime();
      const holderExists = record.members.some(
        (member) => member.walletAddress.toLowerCase() === record.lease?.walletAddress.toLowerCase(),
      );
      if (leaseExpired || !holderExists) {
        delete record.lease;
      }
    }
  }

  private refreshLease(record: QueueRecord, walletAddress: string): void {
    const position = this.position(record, walletAddress);
    if (position !== 1) return;
    const currentLease = record.lease;
    if (currentLease && currentLease.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) return;
    record.lease = {
      walletAddress,
      expiresAt: new Date(this.now().getTime() + this.leaseMs).toISOString(),
    };
  }

  private remove(record: QueueRecord, walletAddress: string): void {
    record.members = record.members.filter((member) => member.walletAddress.toLowerCase() !== walletAddress.toLowerCase());
    if (record.lease?.walletAddress.toLowerCase() === walletAddress.toLowerCase()) {
      delete record.lease;
    }
  }

  private rotateToBack(record: QueueRecord, walletAddress: string): void {
    const index = record.members.findIndex((member) => member.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (index < 0) return;
    const [member] = record.members.splice(index, 1);
    if (member) record.members.push(member);
  }

  private position(record: QueueRecord, walletAddress: string): number {
    const index = record.members.findIndex((member) => member.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    return index < 0 ? 0 : index + 1;
  }

  private response(
    record: QueueRecord,
    walletAddress: string | null,
    eligible: boolean,
    reason: string | undefined,
    status: LiquidationQueueResponse["queue"]["status"],
  ): LiquidationQueueResponse {
    const position = walletAddress ? this.position(record, walletAddress) : 0;
    const currentWalletAddress = record.members[0]?.walletAddress;
    const action = status === "execute" ? "execute" : status === "rotated" ? "rotated" : eligible ? "wait_turn" : "excluded";
    return {
      ok: true,
      source: "liquidation-queue-server",
      generatedAt: this.now().toISOString(),
      chain: record.chain,
      market: record.market,
      walletAddress,
      eligible,
      reason,
      queue: {
        enabled: true,
        status,
        action,
        position,
        size: record.members.length,
        currentWalletAddress,
        leaseExpiresAt: record.lease?.expiresAt,
      },
    };
  }

  private persist(): void {
    saveState(this.stateFile, this.state);
  }
}
