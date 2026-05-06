import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type DashboardLiveState = {
  updatedAt?: string;
  lastAction?: string;
  lastResult?: unknown;
  scan?: unknown;
  analyze?: unknown;
  morphoBlueAnalyze?: unknown;
  morphoExecutorCheck?: unknown;
  executeLiquidator?: unknown;
  liquidator?: unknown;
  selfFunded?: unknown;
  arbitrage?: {
    market?: string;
    token?: string;
    venues?: string;
    lastResult?: unknown;
  };
};

function liveStateFilePath(): string {
  return path.resolve(
    process.cwd(),
    process.env.DASHBOARD_STATE_FILE ?? ".data/dashboard-live-state.json",
  );
}

function ensureDirectory(filePath: string): void {
  const directory = path.dirname(filePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

export function loadDashboardLiveState(): DashboardLiveState {
  const filePath = liveStateFilePath();
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as DashboardLiveState;
  } catch {
    return {};
  }
}

export function saveDashboardLiveState(
  patch: Partial<DashboardLiveState>,
): DashboardLiveState {
  const filePath = liveStateFilePath();
  ensureDirectory(filePath);

  const nextState: DashboardLiveState = {
    ...loadDashboardLiveState(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(filePath, JSON.stringify(nextState, null, 2), "utf8");
  return nextState;
}

export function dashboardLiveStateFilePath(): string {
  return liveStateFilePath();
}
