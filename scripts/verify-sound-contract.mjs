import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const app = read("src/App.vue");
const soundModule = read("src/audio/alert-sounds.ts");
const settings = read("src/features/settings/SettingsView.vue");

const failures = [];
const requireSource = (source, snippet, message) => {
  if (!source.includes(snippet)) failures.push(message);
};

requireSource(app, "setAlertSoundsEnabled(enabled)", "global switch must control configured alert sounds");
requireSource(app, "stopLaunchAudios()", "global switch must stop active launch sounds");
requireSource(app, ":sound-enabled=\"launchSoundEnabled\"", "settings previews must receive the global switch state");
requireSource(soundModule, "if (!alertSoundsEnabled) return null", "configured alerts must stay silent while globally muted");
requireSource(soundModule, "activeAlertSounds.clear()", "muting must stop active configured alerts");
requireSource(settings, "if (!props.soundEnabled) return", "alert previews must stay silent while globally muted");
requireSource(settings, "if (!enabled) stopAlertSoundPreview()", "muting must stop an active alert preview");

if (failures.length) {
  for (const failure of failures) console.error(`sound contract check failed: ${failure}`);
  process.exit(1);
}

console.log("sound contract check passed");
