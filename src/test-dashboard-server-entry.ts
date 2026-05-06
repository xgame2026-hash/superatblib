import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./dashboard.ts", import.meta.url), "utf8");

assert.ok(
  source.includes(
    'import {\n  createDashboardApiHandler,\n  serveDashboardHtml,\n  serveDashboardStaticAsset,\n} from "./dashboard-http-handler.js";',
  ),
  "dashboard.ts should import server handler helpers",
);
assert.ok(
  source.includes("const serveApi = createDashboardApiHandler({"),
  "dashboard.ts should create the api handler from injected deps",
);
assert.ok(
  source.includes("const serveHtml = (res: ServerResponse): void => {"),
  "dashboard.ts should keep a thin html responder wrapper",
);
assert.ok(
  source.includes("const serveStaticAsset = ("),
  "dashboard.ts should keep a thin static asset responder wrapper",
);

assert.ok(!source.includes("async function serveApi("), "dashboard.ts should not inline serveApi anymore");
assert.ok(!source.includes("function serveHtml("), "dashboard.ts should not inline serveHtml anymore");
assert.ok(!source.includes("function serveStaticAsset("), "dashboard.ts should not inline serveStaticAsset anymore");

console.log("dashboard server entry ok");
