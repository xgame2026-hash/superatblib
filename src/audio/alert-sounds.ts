import rewardSound1Url from "../music/reward/r1.mp3";
import rewardSound2Url from "../music/reward/r2.mp3";
import rewardSound3Url from "../music/reward/r3.mp3";
import rewardSound4Url from "../music/reward/r4.mp3";
import rewardSound5Url from "../music/reward/r5.mp3";
import upgradeRequiredSound1Url from "../music/update/u1.mp3";
import upgradeRequiredSound2Url from "../music/update/u2.mp3";
import upgradeRequiredSound3Url from "../music/update/u3.mp3";
import upgradeRequiredSound4Url from "../music/update/u4.mp3";
import upgradeRequiredSound5Url from "../music/update/u5.mp3";
import upgradeCompletedSound1Url from "../music/updateCompleted/v1.mp3";
import upgradeCompletedSound2Url from "../music/updateCompleted/v2.mp3";
import upgradeCompletedSound3Url from "../music/updateCompleted/v3.mp3";
import upgradeCompletedSound4Url from "../music/updateCompleted/v4.mp3";
import upgradeCompletedSound5Url from "../music/updateCompleted/v5.mp3";
import slotAnchoredSound1Url from "../music/slot/s1.mp3";
import slotAnchoredSound2Url from "../music/slot/s2.mp3";
import slotAnchoredSound3Url from "../music/slot/s3.mp3";
import slotAnchoredSound4Url from "../music/slot/s4.mp3";
import slotAnchoredSound5Url from "../music/slot/s5.mp3";

export const ALERT_SOUND_IDS = ["sound_1", "sound_2", "sound_3", "sound_4", "sound_5"] as const;

export type AlertSoundId = (typeof ALERT_SOUND_IDS)[number];

export type AlertSoundKey =
  | "rewardReceived"
  | "upgradeRequired"
  | "upgradeCompleted"
  | "slotAnchored";

export const ALERT_SOUND_URLS = {
  rewardReceived: {
    sound_1: rewardSound1Url,
    sound_2: rewardSound2Url,
    sound_3: rewardSound3Url,
    sound_4: rewardSound4Url,
    sound_5: rewardSound5Url,
  },
  upgradeRequired: {
    sound_1: upgradeRequiredSound1Url,
    sound_2: upgradeRequiredSound2Url,
    sound_3: upgradeRequiredSound3Url,
    sound_4: upgradeRequiredSound4Url,
    sound_5: upgradeRequiredSound5Url,
  },
  upgradeCompleted: {
    sound_1: upgradeCompletedSound1Url,
    sound_2: upgradeCompletedSound2Url,
    sound_3: upgradeCompletedSound3Url,
    sound_4: upgradeCompletedSound4Url,
    sound_5: upgradeCompletedSound5Url,
  },
  slotAnchored: {
    sound_1: slotAnchoredSound1Url,
    sound_2: slotAnchoredSound2Url,
    sound_3: slotAnchoredSound3Url,
    sound_4: slotAnchoredSound4Url,
    sound_5: slotAnchoredSound5Url,
  },
} as const satisfies Record<AlertSoundKey, Record<AlertSoundId, string>>;

let alertSoundsEnabled = true;
const activeAlertSounds = new Set<HTMLAudioElement>();

export function normalizeAlertSoundId(value: unknown): AlertSoundId {
  const normalized = typeof value === "string" || typeof value === "number"
    ? String(value).trim().toLowerCase()
    : "";
  const match = /^(?:sound_|prompt_)?([1-5])$/.exec(normalized);
  return match ? (`sound_${match[1]}` as AlertSoundId) : "sound_1";
}

export function resolveAlertSoundUrl(key: AlertSoundKey, id: unknown): string {
  return ALERT_SOUND_URLS[key][normalizeAlertSoundId(id)];
}

/** Keeps every configured notification under the application's global sound switch. */
export function setAlertSoundsEnabled(enabled: boolean): void {
  alertSoundsEnabled = enabled;
  if (enabled) return;
  for (const audio of activeAlertSounds) {
    audio.pause();
    audio.currentTime = 0;
  }
  activeAlertSounds.clear();
}

/** Plays one configured notification when the application's global sound switch is on. */
export function playAlertSound(key: AlertSoundKey, id: unknown): HTMLAudioElement | null {
  if (!alertSoundsEnabled) return null;
  const audio = new Audio(resolveAlertSoundUrl(key, id));
  audio.preload = "auto";
  audio.volume = 0.82;
  activeAlertSounds.add(audio);
  const release = () => activeAlertSounds.delete(audio);
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  void audio.play().catch(release);
  return audio;
}
