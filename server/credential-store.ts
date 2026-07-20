import { spawn } from "node:child_process";

export const LIQ2_CREDENTIAL_KEYS = ["private-key", "app-token", "bnb-rpc-url", "authorization-code"] as const;
export type Liq2CredentialKey = (typeof LIQ2_CREDENTIAL_KEYS)[number];

export type CredentialStore = {
  get(key: Liq2CredentialKey): Promise<string | undefined>;
  set(key: Liq2CredentialKey, value: string): Promise<void>;
};

export type CredentialCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type CredentialCommandRunner = (
  executable: string,
  args: string[],
  stdin?: string,
) => Promise<CredentialCommandResult>;

const DEFAULT_KEYCHAIN_SERVICE = "ai.superarb.liq2";

export function createMacOsKeychainCredentialStore(options: {
  profileId: string;
  serviceName?: string;
  run?: CredentialCommandRunner;
}): CredentialStore {
  const profileId = normalizeIdentifier(options.profileId, "profileId");
  const serviceName = normalizeIdentifier(options.serviceName || DEFAULT_KEYCHAIN_SERVICE, "serviceName");
  const run = options.run ?? runCredentialCommand;

  return {
    async get(key) {
      const account = credentialAccount(profileId, key);
      const result = await run("security", [
        "find-generic-password",
        "-a", account,
        "-s", serviceName,
        "-w",
      ]);
      if (result.exitCode === 44) return undefined;
      if (result.exitCode !== 0) throw commandError("读取 macOS Keychain 凭据失败", result);
      return stripSingleTrailingNewline(result.stdout) || undefined;
    },

    async set(key, value) {
      const secret = normalizeSecret(value, key);
      const account = credentialAccount(profileId, key);
      // macOS documents `-w` with no argument as the safe prompt mode. Keep it
      // last and send the secret over stdin so it never appears in argv, shell
      // history, process listings, or application logs.
      const result = await run("security", [
        "add-generic-password",
        "-a", account,
        "-s", serviceName,
        "-U",
        "-w",
      ], `${secret}\n`);
      if (result.exitCode !== 0) throw commandError("写入 macOS Keychain 凭据失败", result);
    },
  };
}

export function runCredentialCommand(
  executable: string,
  args: string[],
  stdin?: string,
): Promise<CredentialCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? 1 }));
    if (stdin !== undefined) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

function credentialAccount(profileId: string, key: Liq2CredentialKey): string {
  if (!LIQ2_CREDENTIAL_KEYS.includes(key)) throw new Error("不支持的 LIQ2 凭据类型。");
  return `${profileId}:${key}`;
}

function normalizeIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || /[\r\n\0]/.test(normalized)) {
    throw new Error(`${field} 格式不正确。`);
  }
  return normalized;
}

function normalizeSecret(value: string, key: Liq2CredentialKey): string {
  const normalized = value.trim();
  if (!normalized || /[\r\n\0]/.test(normalized)) throw new Error(`${key} 不能为空或包含换行。`);
  return normalized;
}

function stripSingleTrailingNewline(value: string): string {
  return value.replace(/\r?\n$/, "");
}

function commandError(message: string, result: CredentialCommandResult): Error {
  // Never include stdout: successful reads contain the secret. stderr is
  // intentionally reduced to a generic code because platform diagnostics may
  // echo account metadata supplied by the caller.
  return new Error(`${message} (security exit ${result.exitCode})`);
}
