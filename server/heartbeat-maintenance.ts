import {
  createClientRuntimeState,
  isQueueExitReason,
  reduceClientRuntimeState,
  type ClientRuntimeState,
  type QueueExitReason,
} from "./client-runtime-state";

export const PRIVATE_HEARTBEAT_URL = "https://privateapi.superarb.ai/heartbeat";
export const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

export type UserLeaveAction = "pause" | "shutdown";
export type DesiredQueueState = "queued" | "left";
export type HeartbeatConnectionState = "stopped" | "starting" | "online" | "degraded";

export type HeartbeatIdentity = {
  walletAddress: string;
  systemId: string;
  appToken: string;
  chain: "bnb";
  market: string;
  rpcUrl?: string;
  clientVersion: string;
  protocolVersion: string;
};

export type HeartbeatRuntimeState = {
  desiredQueueState: DesiredQueueState;
  connectionState: HeartbeatConnectionState;
  lastHeartbeatAt?: string;
  lastSuccessfulHeartbeatAt?: string;
  consecutiveFailures: number;
  pendingLeave?: { action: UserLeaveAction; requestedAt: string; identity: HeartbeatIdentity };
  runtime: ClientRuntimeState;
};

export type QueueAdapter = {
  join: (identity: HeartbeatIdentity) => Promise<{ ok: boolean; error?: string }>;
  leave: (identity: HeartbeatIdentity, action: UserLeaveAction) => Promise<{ ok: boolean; error?: string }>;
};

export type HeartbeatStateStore = {
  load: () => Pick<HeartbeatRuntimeState, "pendingLeave"> | undefined;
  save: (state: Pick<HeartbeatRuntimeState, "pendingLeave">) => void;
};

export type HeartbeatScheduler = {
  setInterval: (callback: () => void, intervalMs: number) => unknown;
  clearInterval: (timer: unknown) => void;
};

export type HeartbeatOperationResult = {
  ok: boolean;
  queued: boolean;
  connectionState: HeartbeatConnectionState;
  pending?: boolean;
  error?: string;
};

export type HeartbeatMaintenance = {
  start: (identity: HeartbeatIdentity) => Promise<HeartbeatOperationResult>;
  pause: () => Promise<HeartbeatOperationResult>;
  shutdown: () => Promise<HeartbeatOperationResult>;
  restorePendingLeave: () => Promise<HeartbeatOperationResult>;
  stopLocalTimer: () => void;
  getState: () => HeartbeatRuntimeState;
};

/**
 * Maintains connection evidence without using heartbeat failures to revoke
 * queue membership. Only pause and shutdown can request a voluntary leave.
 */
export function createHeartbeatMaintenance(options: {
  queue: QueueAdapter;
  store?: HeartbeatStateStore;
  fetchImpl?: typeof fetch;
  scheduler?: HeartbeatScheduler;
  now?: () => Date;
}): HeartbeatMaintenance {
  const scheduler = options.scheduler ?? browserOrNodeScheduler();
  const now = options.now ?? (() => new Date());
  const persisted = sanitizePendingLeave(options.store?.load()?.pendingLeave);
  let identity: HeartbeatIdentity | undefined;
  let timer: unknown;
  let requestChain: Promise<HeartbeatSendResult> = Promise.resolve({ ok: true });
  let state: HeartbeatRuntimeState = {
    desiredQueueState: "left",
    connectionState: "stopped",
    consecutiveFailures: 0,
    pendingLeave: persisted,
    runtime: createClientRuntimeState(),
  };

  async function start(nextIdentity: HeartbeatIdentity): Promise<HeartbeatOperationResult> {
    const normalized = normalizeIdentity(nextIdentity);
    if (state.pendingLeave) {
      const restored = await restorePendingLeave();
      if (!restored.ok) return { ...restored, error: `上次离队尚未确认：${restored.error ?? "unknown error"}` };
    }
    stopLocalTimer();
    identity = normalized;
    state = {
      desiredQueueState: "left",
      connectionState: "starting",
      consecutiveFailures: 0,
      runtime: reduceClientRuntimeState(state.runtime, { type: "queue.join-requested" }),
    };
    const joined = await options.queue.join(normalized);
    if (!joined.ok) {
      state.connectionState = "stopped";
      state.runtime = reduceClientRuntimeState(state.runtime, { type: "queue.join-failed" });
      return operation(false, joined.error ?? "进入排队失败。");
    }

    state.desiredQueueState = "queued";
    state.runtime = reduceClientRuntimeState(state.runtime, { type: "queue.joined" });
    timer = scheduler.setInterval(() => {
      if (state.desiredQueueState === "queued") void sendHeartbeat("online");
    }, HEARTBEAT_INTERVAL_MS);
    const first = await sendHeartbeat("online");
    // A temporary heartbeat failure must not undo the successful queue join.
    return operation(true, first.ok ? undefined : first.error);
  }

  async function leave(action: UserLeaveAction): Promise<HeartbeatOperationResult> {
    if (!identity) {
      if (state.pendingLeave) return restorePendingLeave();
      state.desiredQueueState = "left";
      state.connectionState = "stopped";
      stopLocalTimer();
      return operation(true);
    }

    state.desiredQueueState = "left";
    stopLocalTimer();
    state.runtime = reduceClientRuntimeState(state.runtime, {
      type: "queue.exit-requested",
      reason: leaveReason(action),
    });
    state.pendingLeave = { action, requestedAt: now().toISOString(), identity };
    persist();

    const queueResult = await options.queue.leave(identity, action).catch((error) => ({ ok: false, error: errorMessage(error) }));
    const heartbeatResult = await sendHeartbeat("offline", action);
    if (queueResult.ok && heartbeatResult.ok) {
      state.pendingLeave = undefined;
      state.connectionState = "stopped";
      state.consecutiveFailures = 0;
      state.runtime = reduceClientRuntimeState(state.runtime, { type: "queue.exited" });
      persist();
      return operation(true);
    }

    state.connectionState = "degraded";
    state.runtime = reduceClientRuntimeState(state.runtime, { type: "queue.exit-failed" });
    persist();
    return {
      ...operation(false, queueResult.error || heartbeatResult.error || "离队状态尚未确认。"),
      pending: true,
    };
  }

  async function restorePendingLeave(): Promise<HeartbeatOperationResult> {
    const pending = state.pendingLeave;
    if (!pending) return operation(true);
    identity = pending.identity;
    state.desiredQueueState = "left";
    stopLocalTimer();
    state.runtime = reduceClientRuntimeState(state.runtime, {
      type: "queue.exit-requested",
      reason: leaveReason(pending.action),
    });
    const queueResult = await options.queue.leave(pending.identity, pending.action).catch((error) => ({ ok: false, error: errorMessage(error) }));
    const heartbeatResult = await sendHeartbeat("offline", pending.action);
    if (queueResult.ok && heartbeatResult.ok) {
      state.pendingLeave = undefined;
      state.connectionState = "stopped";
      state.consecutiveFailures = 0;
      state.runtime = reduceClientRuntimeState(state.runtime, { type: "queue.exited" });
      persist();
      return operation(true);
    }
    state.connectionState = "degraded";
    state.runtime = reduceClientRuntimeState(state.runtime, { type: "queue.exit-failed" });
    persist();
    return { ...operation(false, queueResult.error || heartbeatResult.error || "待处理离队仍未确认。"), pending: true };
  }

  function sendHeartbeat(status: "online" | "offline", leaveAction?: UserLeaveAction): Promise<HeartbeatSendResult> {
    const current = identity;
    if (!current) return Promise.resolve({ ok: false, error: "缺少心跳身份。" });
    // Serialize requests so an older online response cannot overtake an
    // explicit pause/shutdown offline request.
    requestChain = requestChain.catch(() => ({ ok: false })).then(async () => {
      const attemptedAt = now().toISOString();
      state.lastHeartbeatAt = attemptedAt;
      state.runtime = reduceClientRuntimeState(state.runtime, { type: "heartbeat.attempted", at: attemptedAt });
      try {
        const response = await (options.fetchImpl ?? fetch)(PRIVATE_HEARTBEAT_URL, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            authorization: `Bearer ${current.appToken}`,
            "x-supermtnode-app-token": current.appToken,
          },
          body: JSON.stringify({
            walletAddress: current.walletAddress,
            systemId: current.systemId,
            chain: current.chain,
            market: current.market,
            rpcUrl: current.rpcUrl,
            clientVersion: current.clientVersion,
            protocolVersion: current.protocolVersion,
            status,
            executionStatus: status === "online" ? "running" : "stopped",
            queueStatus: status === "online" ? "queued" : "left",
            leaveAction: status === "offline" ? leaveAction : undefined,
            heartbeatAt: attemptedAt,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const payload = await parseOptionalJson(response);
        if (!response.ok || payload.ok === false) {
          const error = stringValue(payload.error, payload.message) || `heartbeat returned HTTP ${response.status}`;
          recordFailure(status);
          return { ok: false, error };
        }
        state.lastSuccessfulHeartbeatAt = stringValue(payload.heartbeatAt, payload.heartbeat_at) || attemptedAt;
        state.consecutiveFailures = 0;
        state.connectionState = status === "online" ? "online" : "stopped";
        state.runtime = status === "online"
          ? reduceClientRuntimeState(state.runtime, { type: "heartbeat.succeeded", at: state.lastSuccessfulHeartbeatAt })
          : reduceClientRuntimeState(state.runtime, { type: "queue.exited" });
        return { ok: true };
      } catch (error) {
        recordFailure(status);
        return { ok: false, error: errorMessage(error) };
      }
    });
    return requestChain;
  }

  function recordFailure(status: "online" | "offline"): void {
    state.consecutiveFailures += 1;
    state.connectionState = "degraded";
    state.runtime = reduceClientRuntimeState(state.runtime, {
      type: status === "online" ? "heartbeat.failed" : "queue.exit-failed",
    });
    // Crucially, an online heartbeat failure leaves desiredQueueState queued.
    if (status === "offline") state.desiredQueueState = "left";
  }

  function stopLocalTimer(): void {
    if (timer !== undefined) scheduler.clearInterval(timer);
    timer = undefined;
  }

  function operation(ok: boolean, error?: string): HeartbeatOperationResult {
    return {
      ok,
      queued: state.desiredQueueState === "queued",
      connectionState: state.connectionState,
      error,
    };
  }

  function persist(): void {
    options.store?.save({ pendingLeave: state.pendingLeave });
  }

  return {
    start,
    pause: () => leave("pause"),
    shutdown: () => leave("shutdown"),
    restorePendingLeave,
    stopLocalTimer,
    getState: () => structuredClone(state),
  };
}

type HeartbeatSendResult = { ok: boolean; error?: string };

function normalizeIdentity(value: HeartbeatIdentity): HeartbeatIdentity {
  const walletAddress = value.walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(walletAddress)) throw new Error("walletAddress 格式不正确。");
  const appToken = required(value.appToken, "appToken");
  const rpcUrl = optionalHttpUrl(value.rpcUrl);
  return {
    walletAddress,
    appToken,
    rpcUrl,
    systemId: required(value.systemId, "systemId"),
    chain: "bnb",
    market: required(value.market, "market").slice(0, 160),
    clientVersion: required(value.clientVersion, "clientVersion"),
    protocolVersion: required(value.protocolVersion, "protocolVersion"),
  };
}

function sanitizePendingLeave(value: unknown): HeartbeatRuntimeState["pendingLeave"] {
  if (!value || typeof value !== "object") return undefined;
  const pending = value as Partial<NonNullable<HeartbeatRuntimeState["pendingLeave"]>>;
  if (!pending.identity || !["pause", "shutdown"].includes(String(pending.action))) return undefined;
  try {
    return {
      action: pending.action as UserLeaveAction,
      requestedAt: Number.isFinite(new Date(String(pending.requestedAt)).getTime()) ? String(pending.requestedAt) : new Date().toISOString(),
      identity: normalizeIdentity(pending.identity),
    };
  } catch {
    return undefined;
  }
}

function leaveReason(action: UserLeaveAction): QueueExitReason {
  const reason = action === "shutdown" ? "logout" : action;
  if (!isQueueExitReason(reason)) throw new Error("不允许的离队原因。");
  return reason;
}

function browserOrNodeScheduler(): HeartbeatScheduler {
  return {
    setInterval: (callback, intervalMs) => globalThis.setInterval(callback, intervalMs),
    clearInterval: (timer) => globalThis.clearInterval(timer as ReturnType<typeof setInterval>),
  };
}

function required(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${field} 未配置。`);
  return text;
}

function optionalHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim();
  const url = new URL(text);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("rpcUrl 只允许 HTTP(S)。");
  return text;
}

async function parseOptionalJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const payload = JSON.parse(text) as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
