export type AuthorizationState = "unknown" | "validating" | "valid" | "expired" | "revoked";
export type PresenceState = "offline" | "connecting" | "online" | "degraded";
export type QueueState = "not_queued" | "joining" | "queued" | "leaving" | "left";

export const QUEUE_EXIT_REASONS = ["pause", "logout", "heartbeat-timeout", "rpc-expired"] as const;
export type QueueExitReason = (typeof QUEUE_EXIT_REASONS)[number];

export type ClientRuntimeState = {
  authorization: AuthorizationState;
  presence: PresenceState;
  queue: QueueState;
  lastHeartbeatAttemptAt?: string;
  lastSuccessfulHeartbeatAt?: string;
  pendingExitReason?: QueueExitReason;
};

export type ClientRuntimeEvent =
  | { type: "authorization.validation-started" }
  | { type: "authorization.valid" }
  | { type: "authorization.expired" }
  | { type: "authorization.revoked" }
  | { type: "queue.join-requested" }
  | { type: "queue.joined" }
  | { type: "queue.join-failed" }
  | { type: "heartbeat.attempted"; at: string }
  | { type: "heartbeat.succeeded"; at: string }
  | { type: "heartbeat.failed" }
  | { type: "connection.closed" }
  | { type: "queue.exit-requested"; reason: QueueExitReason }
  | { type: "queue.exited" }
  | { type: "queue.exit-failed" };

export function createClientRuntimeState(): ClientRuntimeState {
  return {
    authorization: "unknown",
    presence: "offline",
    queue: "not_queued",
  };
}

/**
 * The queue is an explicit durable state. Presence loss is only connection
 * evidence and must never be interpreted as a queue exit.
 */
export function reduceClientRuntimeState(
  state: ClientRuntimeState,
  event: ClientRuntimeEvent,
): ClientRuntimeState {
  switch (event.type) {
    case "authorization.validation-started":
      return { ...state, authorization: "validating" };
    case "authorization.valid":
      return { ...state, authorization: "valid" };
    case "authorization.expired":
      return { ...state, authorization: "expired" };
    case "authorization.revoked":
      return { ...state, authorization: "revoked" };
    case "queue.join-requested":
      return { ...state, queue: "joining", presence: "connecting", pendingExitReason: undefined };
    case "queue.joined":
      return { ...state, queue: "queued", pendingExitReason: undefined };
    case "queue.join-failed":
      return { ...state, queue: "not_queued", presence: "offline", pendingExitReason: undefined };
    case "heartbeat.attempted":
      return { ...state, lastHeartbeatAttemptAt: event.at };
    case "heartbeat.succeeded":
      return {
        ...state,
        presence: "online",
        lastHeartbeatAttemptAt: event.at,
        lastSuccessfulHeartbeatAt: event.at,
      };
    case "heartbeat.failed":
      return { ...state, presence: "degraded" };
    case "connection.closed":
      return { ...state, presence: "offline" };
    case "queue.exit-requested":
      return { ...state, queue: "leaving", pendingExitReason: event.reason };
    case "queue.exited":
      return { ...state, queue: "left", presence: "offline", pendingExitReason: undefined };
    case "queue.exit-failed":
      return { ...state, queue: "leaving", presence: "degraded" };
  }
}

export function isQueueExitReason(value: unknown): value is QueueExitReason {
  return typeof value === "string" && QUEUE_EXIT_REASONS.includes(value as QueueExitReason);
}
