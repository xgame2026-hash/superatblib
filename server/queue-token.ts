const OFFICIAL_QUEUE_TOKEN = "325cd936fa62340f8080a95c2d430a394ecc659a011d9f455b1d6d2f197f37b5";

export function queueWssToken(env: Record<string, string>): string {
  return env.QUEUE_TOKEN?.trim() || env.LIQUIDATION_QUEUE_WSS_TOKEN?.trim() || OFFICIAL_QUEUE_TOKEN;
}

export function hasConfiguredQueueWssToken(env: Record<string, string>): boolean {
  return Boolean(env.QUEUE_TOKEN?.trim() || env.LIQUIDATION_QUEUE_WSS_TOKEN?.trim());
}
