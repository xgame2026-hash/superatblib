import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root,
  encoding: "utf8",
});
if (listed.status !== 0) throw new Error(listed.stderr || "Unable to enumerate public release files.");

const files = listed.stdout.split("\0").filter(Boolean).filter((path) => existsSync(resolve(root, path)));
const failures = [];
const forbiddenPaths = [
  /^server\/state-api-rust(?:\/|$)/,
  /(?:^|\/)\.superarb(?:\/|$)/,
  /(?:^|\/)outputs(?:\/|$)/,
  /(?:^|\/)\.env(?:\.|$)/,
  /\.sql$/i,
  /\.(?:key|p12|pfx|jks|keystore)$/i,
  /(?:^|\/)(?:secrets?|credentials?)(?:\/|\.|$)/i,
];
const allowedPaths = new Set([".env.example", "server/tx-wallet-public.pem"]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /postgres(?:ql)?:\/\/[^\s]+@/i,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk_live_[A-Za-z0-9]{16,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
];

for (const path of files) {
  if (!allowedPaths.has(path) && forbiddenPaths.some((pattern) => pattern.test(path))) {
    failures.push(`${path}: forbidden in the public client repository`);
    continue;
  }
  const absolute = resolve(root, path);
  if (!statSync(absolute).isFile() || statSync(absolute).size > 2_000_000) continue;
  let source;
  try {
    source = readFileSync(absolute, "utf8");
  } catch {
    continue;
  }
  if (secretPatterns.some((pattern) => pattern.test(source))) failures.push(`${path}: possible embedded secret`);
}

if (failures.length) {
  for (const failure of failures) console.error(`public release check failed: ${failure}`);
  process.exit(1);
}

if (files.some((path) => path.split(sep).includes("state-api-rust"))) process.exit(1);
console.log(`public release check passed (${files.length} publishable files, no private backend/database/secrets)`);
