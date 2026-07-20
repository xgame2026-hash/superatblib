import { isAbsolute, resolve } from "node:path";

export const LIQ2_PROFILE = normalizeProfile(process.env.LIQ2_PROFILE);
export const ENV_FILE = resolveConfiguredPath(
  process.env.LIQ2_ENV_FILE,
  LIQ2_PROFILE ? `.env.${LIQ2_PROFILE}` : ".env",
);
export const STATE_DIR = resolveConfiguredPath(
  process.env.LIQ2_STATE_DIR,
  LIQ2_PROFILE ? `.superarb/${LIQ2_PROFILE}` : ".superarb",
);

export function stateFile(name: string): string {
  const cleanName = name.trim().replace(/^[/\\]+/, "");
  if (!cleanName || cleanName.includes("..")) throw new Error("Invalid LIQ2 state filename.");
  return resolve(STATE_DIR, cleanName);
}

function normalizeProfile(value: string | undefined): string {
  const profile = value?.trim() ?? "";
  if (!profile) return "";
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(profile)) throw new Error("LIQ2_PROFILE only allows letters, numbers, _ and -.");
  return profile;
}

function resolveConfiguredPath(value: string | undefined, fallback: string): string {
  const selected = value?.trim() || fallback;
  return isAbsolute(selected) ? selected : resolve(process.cwd(), selected);
}
