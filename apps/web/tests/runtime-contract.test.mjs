import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the default test command builds first and explicitly enables TypeScript on Node 22.13", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts.test, "npm run build && npm run test:unit");
  assert.match(manifest.scripts["test:unit"], /^node --experimental-strip-types --test tests\/\*\.test\.mjs$/);
});
