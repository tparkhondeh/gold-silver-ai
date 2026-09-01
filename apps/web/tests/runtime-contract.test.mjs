import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the default test command builds first and enforces source coverage on Node 22.13", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts.test, "npm run build && npm run test:coverage");
  assert.match(manifest.scripts["test:unit"], /^node --experimental-strip-types --test tests\/\*\.test\.mjs$/);
  assert.match(manifest.scripts["test:coverage"], /--experimental-strip-types/);
  assert.match(manifest.scripts["test:coverage"], /--experimental-test-coverage/);
  assert.match(manifest.scripts["test:coverage"], /--test-coverage-lines=85/);
  assert.match(manifest.scripts["test:coverage"], /--test-coverage-branches=65/);
  assert.match(manifest.scripts["test:coverage"], /--test-coverage-functions=80/);
  assert.match(manifest.scripts["test:coverage"], /--test-coverage-include=scripts\/\*\*\/\*\.ts/);
  assert.doesNotMatch(manifest.scripts["test:coverage"], /dist\/\*\*/);
  assert.equal(manifest.scripts["db:backup"], "node --experimental-strip-types scripts/local-postgres.mjs backup");
  assert.equal(manifest.scripts["ops:check-local"], "node --experimental-strip-types scripts/check-local-readiness.mjs");
});
