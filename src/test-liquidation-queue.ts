import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { LiquidationQueueStore } from "./liquidation-queue.js";

const tempDir = mkdtempSync(path.join(tmpdir(), "liq-queue-"));

try {
  const store = new LiquidationQueueStore({
    stateFile: path.join(tempDir, "queue.json"),
    memberTtlMs: 60_000,
    leaseMs: 30_000,
    now: () => new Date("2026-05-12T12:00:00.000Z"),
  });

  const first = store.status({
    chain: "arbitrum",
    market: "aave-v3-arbitrum",
    walletAddress: "0x1111111111111111111111111111111111111111",
    endpointSlug: "arb-a",
    eligible: true,
    remainingRequests: 100,
  });
  assert.equal(first.queue.position, 1);
  assert.equal(first.queue.size, 1);
  assert.equal(first.queue.action, "execute");

  const second = store.status({
    chain: "arbitrum",
    market: "aave-v3-arbitrum",
    walletAddress: "0x2222222222222222222222222222222222222222",
    endpointSlug: "arb-b",
    eligible: true,
    remainingRequests: 100,
  });
  assert.equal(second.queue.position, 2);
  assert.equal(second.queue.size, 2);
  assert.equal(second.queue.action, "wait_turn");

  const rotated = store.event({
    chain: "arbitrum",
    market: "aave-v3-arbitrum",
    walletAddress: "0x1111111111111111111111111111111111111111",
    endpointSlug: "arb-a",
    outcome: "success",
  });
  assert.equal(rotated.queue.action, "rotated");
  assert.equal(rotated.queue.position, 2);
  assert.equal(rotated.queue.currentWalletAddress, "0x2222222222222222222222222222222222222222");

  const secondTurn = store.status({
    chain: "arbitrum",
    market: "aave-v3-arbitrum",
    walletAddress: "0x2222222222222222222222222222222222222222",
    endpointSlug: "arb-b",
    eligible: true,
    remainingRequests: 100,
  });
  assert.equal(secondTurn.queue.position, 1);
  assert.equal(secondTurn.queue.action, "execute");

  const excluded = store.status({
    chain: "arbitrum",
    market: "aave-v3-arbitrum",
    walletAddress: "0x2222222222222222222222222222222222222222",
    endpointSlug: "arb-b",
    eligible: false,
    reason: "RPC request limit is exhausted.",
  });
  assert.equal(excluded.eligible, false);
  assert.equal(excluded.queue.action, "excluded");
  assert.equal(excluded.queue.size, 1);

  const bnb = store.status({
    chain: "bnb",
    market: "aave-v3-bnb",
    walletAddress: "0x3333333333333333333333333333333333333333",
    endpointSlug: "bnb-a",
    eligible: true,
    remainingRequests: 100,
  });
  assert.equal(bnb.chain, "bnb");
  assert.equal(bnb.queue.position, 1);
  assert.equal(bnb.queue.action, "execute");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
