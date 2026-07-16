const MIN_COMMIT_PREFIX_LENGTH = 7;

export function normalizeVersionLabel(source: string): string {
  const normalized = source.trim().replace(/^release[-_/]/i, "").replace(/^v/i, "");
  return normalized.split("+")[0] || normalized;
}

export function compareVersionLabels(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

export function normalizeCommit(source: string): string {
  return source.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
}

export function commitsMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeCommit(left);
  const normalizedRight = normalizeCommit(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (Math.min(normalizedLeft.length, normalizedRight.length) < MIN_COMMIT_PREFIX_LENGTH) return false;
  return normalizedLeft.startsWith(normalizedRight) || normalizedRight.startsWith(normalizedLeft);
}

export function isBuildCurrentOrNewer(
  currentVersion: string,
  latestVersion: string,
  currentCommit: string,
  latestCommit: string,
): boolean {
  const versionCompare = compareVersionLabels(currentVersion, latestVersion);
  if (versionCompare !== 0) return versionCompare > 0;
  if (currentCommit && latestCommit) return commitsMatch(currentCommit, latestCommit);
  return true;
}

function versionParts(source: string): number[] {
  return normalizeVersionLabel(source)
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}
