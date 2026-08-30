import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const themeUrl = new URL("../app/asha-theme.css", import.meta.url);

test("keeps the Persian type scale readable and overrides compact Asset Center text", async () => {
  const css = await readFile(themeUrl, "utf8");

  assert.match(css, /--text-xs:\s*0\.8125rem/);
  assert.match(css, /--text-base:\s*0\.9375rem/);
  assert.match(css, /\.asset-facts dt,[\s\S]*?\.asset-signal-list span\s*\{[\s\S]*?font-size:\s*var\(--text-xs\)\s*!important/);
  assert.match(css, /\.asset-facts dd,[\s\S]*?\.asset-signal-list strong\s*\{[\s\S]*?font-size:\s*var\(--text-sm\)\s*!important/);
  assert.match(css, /\.asset-card-head h3\s*\{[\s\S]*?font-size:\s*var\(--text-md\)\s*!important/);
  assert.match(css, /\.brand strong b,[\s\S]*?\.decision-framework-note b,[\s\S]*?\.danger-button\s*\{[\s\S]*?font-size:\s*var\(--text-xs\)\s*!important/);
  assert.match(css, /\.overview-toolbar > div:first-child > span,[\s\S]*?\.opportunity-list article > time\s*\{[\s\S]*?font-size:\s*var\(--text-xs\)\s*!important/);
  assert.match(css, /\.decision-brief-status strong\s*\{[\s\S]*?font-size:\s*var\(--text-md\)\s*!important/);
  assert.match(css, /\.guardrail b,[\s\S]*?\.audit-timeline > div > b,[\s\S]*?\.sort-button i\s*\{[\s\S]*?font-size:\s*var\(--text-xs\)\s*!important/);
  assert.doesNotMatch(css, /\.edit-button,[\s\S]{0,240}?font-size:\s*(?:8|9|10|11)px/);
});
