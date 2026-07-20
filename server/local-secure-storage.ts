import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

/**
 * Atomically writes local credential-bearing state with owner-only access.
 * The stable file is never truncated in place, so a crash cannot leave a
 * partially written .env or pending-operation record.
 */
export function writePrivateTextFile(path: string, contents: string): void {
  const directory = dirname(path);
  const directoryAlreadyExists = existsSync(directory);
  mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  // Never change permissions on an existing workspace/project root merely
  // because its .env is being saved. Only directories created for private
  // runtime state are owned and hardened by this module.
  if (!directoryAlreadyExists) chmodOwnerOnly(directory, PRIVATE_DIRECTORY_MODE);

  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: PRIVATE_FILE_MODE,
    });
    chmodOwnerOnly(temporaryPath, PRIVATE_FILE_MODE);
    renameSync(temporaryPath, path);
    chmodOwnerOnly(path, PRIVATE_FILE_MODE);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not have been created or may already be moved.
    }
    throw error;
  }
}

export function hardenPrivateFilePermissions(path: string): void {
  if (!existsSync(path)) return;
  chmodOwnerOnly(path, PRIVATE_FILE_MODE);
}

function chmodOwnerOnly(path: string, mode: number): void {
  try {
    chmodSync(path, mode);
  } catch (error) {
    if (process.platform !== "win32") throw error;
    // Windows ACLs are managed by the host. Keep the same storage boundary and
    // replace this implementation with Credential Manager in the next phase.
  }
}
