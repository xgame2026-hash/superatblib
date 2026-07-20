export const MANAGED_SOUND_KEYS = [
  "rewardReceived",
  "upgradeRequired",
  "upgradeCompleted",
  "slotAnchored",
] as const;

export const MANAGED_SOUND_IDS = ["sound_1", "sound_2", "sound_3", "sound_4", "sound_5"] as const;

export type ManagedSoundKey = (typeof MANAGED_SOUND_KEYS)[number];
export type ManagedSoundId = (typeof MANAGED_SOUND_IDS)[number];

export type SoundManagementSettings = {
  enabled: boolean;
  volume: number;
  selections: Record<ManagedSoundKey, ManagedSoundId>;
};

type SoundEventBase = {
  occurrenceId: string;
  occurredAt: string;
};

export type ManagedSoundEvent =
  | (SoundEventBase & {
      kind: "rewardReceived";
      source: "tx2";
      rewardProofId: string;
      transactionHash: string;
      amount: string;
      transferVerified: true;
      payoutEventVerified: true;
    })
  | (SoundEventBase & {
      kind: "upgradeRequired";
      source: "verified_manifest";
      currentVersion: string;
      targetVersion: string;
      manifestVerified: true;
    })
  | (SoundEventBase & {
      kind: "upgradeCompleted";
      source: "update_controller";
      updateId: string;
      targetVersion: string;
      runningVersion: string;
      controllerStatus: "completed";
    })
  | (SoundEventBase & {
      kind: "slotAnchored";
      source: "order_created";
      orderId: string;
      orderType: "buy_xbch" | "sell_xbch" | "legacy_trade";
      operation: "created";
    });

export type SoundEventResult = {
  status: "played" | "pending" | "duplicate" | "muted" | "rejected";
  kind: ManagedSoundKey;
  occurrenceId: string;
  reason?: string;
};

export type PersistedSoundState = {
  announced: Partial<Record<ManagedSoundKey, string[]>>;
  pending: ManagedSoundEvent[];
};

export type SoundStateStore = {
  load: () => PersistedSoundState | undefined;
  save: (state: PersistedSoundState) => void;
};

export type SoundPlayer = (
  kind: ManagedSoundKey,
  soundId: ManagedSoundId,
  volume: number,
) => Promise<boolean>;

export type SoundManager = {
  emit: (event: ManagedSoundEvent) => Promise<SoundEventResult>;
  retryPending: () => Promise<SoundEventResult[]>;
  markBaseline: (kind: ManagedSoundKey, occurrenceIds: string[]) => void;
  updateSettings: (next: Partial<SoundManagementSettings>) => SoundManagementSettings;
  getSettings: () => SoundManagementSettings;
  getPending: () => ManagedSoundEvent[];
};

const MAX_EVENT_HISTORY = 500;
const DEFAULT_SETTINGS: SoundManagementSettings = {
  enabled: true,
  volume: 0.82,
  selections: {
    rewardReceived: "sound_1",
    upgradeRequired: "sound_2",
    upgradeCompleted: "sound_3",
    slotAnchored: "sound_4",
  },
};

/**
 * Central sound-delivery manager. Business collectors must provide a verified
 * event; the event is recorded as announced only after playback really starts.
 */
export function createSoundManager(options: {
  player: SoundPlayer;
  store?: SoundStateStore;
  settings?: Partial<SoundManagementSettings>;
}): SoundManager {
  let settings = normalizeSettings(options.settings);
  const persisted = sanitizePersistedState(options.store?.load());
  const announced = new Map<ManagedSoundKey, Set<string>>(
    MANAGED_SOUND_KEYS.map((kind) => [kind, new Set(persisted.announced[kind] ?? [])]),
  );
  const pending = new Map<string, ManagedSoundEvent>();
  for (const event of persisted.pending) {
    if (!validateEvent(event) && !announced.get(event.kind)?.has(event.occurrenceId)) {
      pending.set(eventKey(event), event);
    }
  }
  const inFlight = new Set<string>();

  async function emit(event: ManagedSoundEvent): Promise<SoundEventResult> {
    const reason = validateEvent(event);
    if (reason) return result(event, "rejected", reason);
    const key = eventKey(event);
    if (announced.get(event.kind)?.has(event.occurrenceId)) return result(event, "duplicate");
    if (!settings.enabled) {
      pending.set(key, event);
      persist();
      return result(event, "muted", "全局提示音已关闭，事件已保留。");
    }
    if (inFlight.has(key)) return result(event, "pending", "该事件正在播放确认中。");

    pending.set(key, event);
    persist();
    inFlight.add(key);
    try {
      const played = await options.player(event.kind, settings.selections[event.kind], settings.volume);
      if (!played) return result(event, "pending", "系统尚未允许音频播放，等待用户交互后重试。");
      markAnnounced(event);
      return result(event, "played");
    } catch (error) {
      return result(event, "pending", error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.delete(key);
      persist();
    }
  }

  async function retryPending(): Promise<SoundEventResult[]> {
    if (!settings.enabled) return [...pending.values()].map((event) => result(event, "muted"));
    const results: SoundEventResult[] = [];
    // Sequential playback prevents four unrelated announcements overlapping.
    for (const event of [...pending.values()]) results.push(await emit(event));
    return results;
  }

  function markBaseline(kind: ManagedSoundKey, occurrenceIds: string[]): void {
    const history = announced.get(kind)!;
    for (const occurrenceId of occurrenceIds) {
      const normalized = cleanId(occurrenceId);
      if (normalized) {
        history.add(normalized);
        pending.delete(`${kind}:${normalized}`);
      }
    }
    trimSet(history);
    persist();
  }

  function updateSettings(next: Partial<SoundManagementSettings>): SoundManagementSettings {
    settings = normalizeSettings({
      ...settings,
      ...next,
      selections: { ...settings.selections, ...next.selections },
    });
    persist();
    return cloneSettings(settings);
  }

  function markAnnounced(event: ManagedSoundEvent): void {
    const history = announced.get(event.kind)!;
    history.add(event.occurrenceId);
    trimSet(history);
    pending.delete(eventKey(event));
  }

  function persist(): void {
    options.store?.save({
      announced: Object.fromEntries(MANAGED_SOUND_KEYS.map((kind) => [kind, [...announced.get(kind)!]])),
      pending: [...pending.values()],
    });
  }

  return {
    emit,
    retryPending,
    markBaseline,
    updateSettings,
    getSettings: () => cloneSettings(settings),
    getPending: () => [...pending.values()],
  };
}

export function validateSoundEvent(event: ManagedSoundEvent): { ok: boolean; reason?: string } {
  const reason = validateEvent(event);
  return reason ? { ok: false, reason } : { ok: true };
}

function validateEvent(event: ManagedSoundEvent): string | undefined {
  if (!event || !cleanId(event.occurrenceId)) return "缺少唯一事件编号。";
  if (!validDate(event.occurredAt)) return "事件时间无效。";
  switch (event.kind) {
    case "rewardReceived":
      if (event.source !== "tx2" || event.transferVerified !== true || event.payoutEventVerified !== true) {
        return "奖励必须同时通过 tx2 记录、USDT 转账和发放事件验证。";
      }
      if (!cleanId(event.rewardProofId) || !/^0x[a-fA-F0-9]{64}$/.test(event.transactionHash) || !positiveAmount(event.amount)) {
        return "奖励证明、交易哈希或金额无效。";
      }
      return undefined;
    case "upgradeRequired":
      if (event.source !== "verified_manifest" || event.manifestVerified !== true) return "新版本清单尚未通过验证。";
      if (!isNewerVersion(event.targetVersion, event.currentVersion)) return "目标版本不高于当前版本。";
      return undefined;
    case "upgradeCompleted":
      if (event.source !== "update_controller" || event.controllerStatus !== "completed") return "更新控制器尚未完成。";
      if (!cleanId(event.updateId) || !versionsEqual(event.runningVersion, event.targetVersion)) {
        return "当前运行版本与更新目标版本不一致。";
      }
      return undefined;
    case "slotAnchored":
      if (event.source !== "order_created" || event.operation !== "created") return "卡槽提示音只接受新增订单事件。";
      if (!cleanId(event.orderId) || !["buy_xbch", "sell_xbch", "legacy_trade"].includes(event.orderType)) {
        return "新增订单编号或交易类型无效。";
      }
      return undefined;
    default:
      return "未知提示音事件。";
  }
}

function normalizeSettings(value?: Partial<SoundManagementSettings>): SoundManagementSettings {
  const selections = value?.selections ?? DEFAULT_SETTINGS.selections;
  return {
    enabled: value?.enabled !== false,
    volume: normalizeVolume(value?.volume),
    selections: {
      rewardReceived: normalizeSoundId(selections.rewardReceived, DEFAULT_SETTINGS.selections.rewardReceived),
      upgradeRequired: normalizeSoundId(selections.upgradeRequired, DEFAULT_SETTINGS.selections.upgradeRequired),
      upgradeCompleted: normalizeSoundId(selections.upgradeCompleted, DEFAULT_SETTINGS.selections.upgradeCompleted),
      slotAnchored: normalizeSoundId(selections.slotAnchored, DEFAULT_SETTINGS.selections.slotAnchored),
    },
  };
}

function sanitizePersistedState(value?: PersistedSoundState): PersistedSoundState {
  const announced: PersistedSoundState["announced"] = {};
  for (const kind of MANAGED_SOUND_KEYS) {
    const ids = value?.announced?.[kind];
    announced[kind] = Array.isArray(ids) ? ids.map(cleanId).filter(Boolean).slice(-MAX_EVENT_HISTORY) : [];
  }
  return { announced, pending: Array.isArray(value?.pending) ? value.pending.slice(-MAX_EVENT_HISTORY) : [] };
}

function normalizeSoundId(value: unknown, fallback: ManagedSoundId): ManagedSoundId {
  return MANAGED_SOUND_IDS.includes(value as ManagedSoundId) ? value as ManagedSoundId : fallback;
}

function normalizeVolume(value: unknown): number {
  const volume = Number(value);
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_SETTINGS.volume;
}

function normalizeVersion(value: string): number[] {
  const match = String(value ?? "").trim().replace(/^v/i, "").match(/^\d+(?:\.\d+){0,3}/)?.[0];
  return match ? match.split(".").map(Number) : [];
}

function isNewerVersion(target: string, current: string): boolean {
  const left = normalizeVersion(target);
  const right = normalizeVersion(current);
  if (!left.length || !right.length) return false;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

function versionsEqual(leftValue: string, rightValue: string): boolean {
  const left = normalizeVersion(leftValue);
  const right = normalizeVersion(rightValue);
  if (!left.length || !right.length) return false;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return false;
  }
  return true;
}

function positiveAmount(value: string): boolean {
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0;
}

function validDate(value: string): boolean {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 256) : "";
}

function eventKey(event: ManagedSoundEvent): string {
  return `${event.kind}:${event.occurrenceId}`;
}

function trimSet(values: Set<string>): void {
  while (values.size > MAX_EVENT_HISTORY) values.delete(values.values().next().value!);
}

function result(event: ManagedSoundEvent, status: SoundEventResult["status"], reason?: string): SoundEventResult {
  return { status, kind: event.kind, occurrenceId: event.occurrenceId, reason };
}

function cloneSettings(value: SoundManagementSettings): SoundManagementSettings {
  return { ...value, selections: { ...value.selections } };
}
