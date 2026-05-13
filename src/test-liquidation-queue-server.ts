import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { LiquidationQueueStore } from "./liquidation-queue.js";
import { createLiquidationQueueServer } from "./liquidation-queue-server.js";

const tempDir = mkdtempSync(path.join(tmpdir(), "liq-queue-server-"));
const previousAllowedChains = process.env.LIQUIDATION_QUEUE_ALLOWED_CHAINS;

try {
  process.env.LIQUIDATION_QUEUE_ALLOWED_CHAINS = "bnb";
  const store = new LiquidationQueueStore({
    stateFile: path.join(tempDir, "queue.json"),
    now: () => new Date("2026-05-12T12:00:00.000Z"),
  });
  const server = createLiquidationQueueServer(store);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = typeof address === "object" && address ? address.port : 0;

  const bnbResponse = await fetch(`http://127.0.0.1:${port}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chain: "bnb",
      market: "aave-v3-bnb",
      walletAddress: "0x1111111111111111111111111111111111111111",
      eligible: true,
    }),
  });
  assert.equal(bnbResponse.status, 200);
  const bnbBody = await bnbResponse.json() as { queue?: { action?: string } };
  assert.equal(bnbBody.queue?.action, "execute");

  const arbResponse = await fetch(`http://127.0.0.1:${port}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chain: "arbitrum",
      market: "aave-v3-arbitrum",
      walletAddress: "0x2222222222222222222222222222222222222222",
      eligible: true,
    }),
  });
  assert.equal(arbResponse.status, 403);
  server.close();
  await once(server, "close");
} finally {
  if (previousAllowedChains === undefined) {
    delete process.env.LIQUIDATION_QUEUE_ALLOWED_CHAINS;
  } else {
    process.env.LIQUIDATION_QUEUE_ALLOWED_CHAINS = previousAllowedChains;
  }
  rmSync(tempDir, { recursive: true, force: true });
}
