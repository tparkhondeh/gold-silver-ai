import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { RAHAVARD_FILE_REVIEW, FILE_TEST_STORAGE, MAX_FILE_BYTES, SYNTHETIC_FILE, assertFileImportMode, parseSyntheticFileText, readFileSnapshot, createFileTestPortfolio, evaluateFileTest, encodeFileTest, decodeFileTest, saveFileTest, restoreFileTest } from "../app/file-market-contract.ts";
import { createMarketTestPortfolio, makeNavasanSnapshot, evaluateMarketTest } from "../app/market-test-contract.ts";

// Every value below is deliberately invented; this is NOT a Rahavard export sample.
const now = Date.parse("2000-01-01T12:00:00.000Z");
const receivedAt = new Date(now).toISOString();
const bytes = text => new TextEncoder().encode(text);
const snapshot = (text = SYNTHETIC_FILE) => readFileSnapshot(bytes(text), receivedAt);
const portfolio = async (text = SYNTHETIC_FILE) => ({ ...createFileTestPortfolio(), file: await snapshot(text) });
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}` : JSON.stringify(value);

test("official TXT availability does not enable an unreviewed real import", async () => {
  assert.equal(RAHAVARD_FILE_REVIEW.officialFormat, "TXT");
  assert.equal(RAHAVARD_FILE_REVIEW.realImportEnabled, false);
  assert.equal(RAHAVARD_FILE_REVIEW.columns, null);
  assert.equal(RAHAVARD_FILE_REVIEW.retention, null);
  assert.ok(Object.isFrozen(RAHAVARD_FILE_REVIEW));
  for (const mode of ["rahavard", "real_market_snapshot", "approved", "", null]) {
    assert.throws(() => assertFileImportMode(mode), /مسدود/);
    await assert.rejects(() => readFileSnapshot(null, receivedAt, mode), /مسدود/);
  }
});

test("bounded UTF8 TXT retains exact bytes/hash, explicit units and wholly synthetic provenance", async () => {
  const s = await snapshot();
  assert.equal(s.fileSha256, createHash("sha256").update(SYNTHETIC_FILE).digest("hex"));
  assert.equal(s.fileBytes, bytes(SYNTHETIC_FILE).byteLength);
  assert.equal(s.datasetKind, "synthetic_fixture");
  assert.deepEqual(s.observations.map(q => [q.priceRial, q.purityPermille, q.line]), [["1000", 750, 3], ["2000", null, 4], ["200", 999, 5]]);
  assert.ok(s.observations.every(q => q.source === "asha-synthetic-file"));
  assert.deepEqual((await snapshot("\uFEFF" + SYNTHETIC_FILE.replaceAll("\n", "\r\n"))).observations, s.observations);
  assert.deepEqual((await snapshot(SYNTHETIC_FILE.trimEnd())).observations, s.observations);
});

test("decoding never silently replaces invalid UTF8 or accepts oversized files", async () => {
  await assert.rejects(() => readFileSnapshot(new Uint8Array([0xff, 0xfe, 0x00]), receivedAt), /UTF-8/);
  await assert.rejects(() => readFileSnapshot(new Uint8Array(MAX_FILE_BYTES + 1), receivedAt), /کیلوبایت/);
  await assert.rejects(() => readFileSnapshot(null, receivedAt), /کیلوبایت/);
  assert.throws(() => parseSyntheticFileText("الف".repeat(MAX_FILE_BYTES)), /کیلوبایت/);
  assert.throws(() => parseSyntheticFileText(null));
});

test("reject header guesses, formula/script cells, unknown symbols and ambiguous denominations", () => {
  const invalid = [
    "", SYNTHETIC_FILE.replace("ASHA_SYNTHETIC_TXT_V1", "RAHAVARD"), SYNTHETIC_FILE.replace("symbol,price", "price,symbol"),
    SYNTHETIC_FILE.replace("TEST_GOLD", "__proto__"), SYNTHETIC_FILE.replace("TEST_GOLD", "REAL_GOLD"),
    SYNTHETIC_FILE.replace("100,TOMAN", "=1+2,TOMAN"), SYNTHETIC_FILE.replace("100,TOMAN", "1e6,TOMAN"),
    SYNTHETIC_FILE.replace("100,TOMAN", "<script>,TOMAN"), SYNTHETIC_FILE.replace("100,TOMAN", "100,تومان"),
    SYNTHETIC_FILE.replace("100,TOMAN", '"100",TOMAN'), SYNTHETIC_FILE.replace("100,TOMAN", "1,000,TOMAN"),
    SYNTHETIC_FILE.replace("100,TOMAN", "-1,TOMAN"), SYNTHETIC_FILE.replace("100,TOMAN", "0,TOMAN"),
    SYNTHETIC_FILE.replace("100,TOMAN", "0.000001,TOMAN"),
    SYNTHETIC_FILE.replace("gram,750", "unit,750"), SYNTHETIC_FILE.replace("gram,750", "gram,999"),
    SYNTHETIC_FILE.replace("IRR,unit,,", "IRR,unit,900,"),
  ];
  for (const input of invalid) assert.throws(() => parseSyntheticFileText(input));
});

test("one snapshot only: duplicate/latest/history conflicts reject the whole input", () => {
  const lines = SYNTHETIC_FILE.trimEnd().split("\n");
  assert.throws(() => parseSyntheticFileText(lines.slice(0, 2).join("\n")));
  assert.throws(() => parseSyntheticFileText(SYNTHETIC_FILE + "\n"));
  assert.throws(() => parseSyntheticFileText(SYNTHETIC_FILE + lines[2]));
  assert.throws(() => parseSyntheticFileText([...lines.slice(0, 3), lines[2].replace("100,TOMAN", "101,TOMAN")].join("\n")), /تکراری/);
  assert.equal(parseSyntheticFileText(lines.slice(0, 3).join("\n")).length, 1);
});

test("exact shared portfolio valuation, fractional lots, cash and limits do not create decisions", async () => {
  const p = await portfolio(); const initial = evaluateFileTest(p, now);
  assert.equal(initial.observedTotalRial, "100003000");
  p.inputs.quantitiesMilli.GOLD_18K_IRR = 2345; p.inputs.quantitiesMilli.SILVER_999_IRR = 5000;
  p.inputs.cashRial = "12345"; p.inputs.shortDays = 14; p.inputs.mediumDays = 90; p.inputs.revision++;
  const e = evaluateFileTest(p, now);
  assert.equal(e.observedTotalRial, "17690"); assert.equal(e.currentTotalRial, "17690");
  assert.equal(e.rows[0].valueRial, "2345"); assert.equal(e.minimumCashRial, "3538");
  assert.equal(e.weightsBps.GOLD_18K_IRR, 1325);
  assert.equal(e.decision.state, "undecidable"); assert.equal(e.decision.financialUseAllowed, false);
  for (const key of ["amountRial", "quantityMilli", "costRial", "cashAfterRial"]) assert.equal(e.decision[key], null);
  p.file = await snapshot(SYNTHETIC_FILE.replace("100,TOMAN", "0.1,TOMAN"));
  p.inputs.quantitiesMilli.GOLD_18K_IRR = 333; assert.equal(evaluateFileTest(p, now).rows[0].valueRial, "0");
});

test("reuse does not relabel synthetic file quotes as Navasan or change earlier Navasan results", async () => {
  const p = await portfolio(SYNTHETIC_FILE.replace("100,TOMAN", "10000000,TOMAN").replace("2000,IRR", "1000000000,IRR")); p.inputs.quantitiesMilli.SILVER_999_IRR = 0;
  const n = createMarketTestPortfolio();
  n.snapshot = makeNavasanSnapshot({ "18ayar": { value: "10000000", timestamp: now / 1000 }, sekkeh: { value: "100000", timestamp: now / 1000 } }, "TOMAN", receivedAt);
  assert.equal(evaluateFileTest(p, now).observedTotalRial, evaluateMarketTest(n, now).observedTotalRial);
  assert.equal(p.file.observations[0].source, "asha-synthetic-file");
  p.inputs.snapshot = n.snapshot; assert.throws(() => evaluateFileTest(p, now), /اختلاط/);
});

test("unknown price time is retained null; it never becomes a fresh quote or import time", async () => {
  const p = await portfolio(SYNTHETIC_FILE.replace(",750,2000-01-01T12:00:00.000Z", ",750,"));
  const e = evaluateFileTest(p, now);
  assert.equal(e.rows[0].state, "unknown_time"); assert.equal(e.rows[0].observation.publishedAt, null);
  assert.equal(e.observedTotalRial, "100003000"); assert.equal(e.currentTotalRial, null);
});

test("invalid dates/timezones are rejected; future/stale/missing remain explicit", async () => {
  for (const date of ["2000-02-31T12:00:00.000Z", "2000-01-01", "1378/10/11", "2000-01-01T12:00:00", "bad"]) {
    assert.throws(() => parseSyntheticFileText(SYNTHETIC_FILE.replaceAll(receivedAt, date)));
    await assert.rejects(() => readFileSnapshot(bytes(SYNTHETIC_FILE), date));
  }
  const p = await portfolio(); assert.equal(evaluateFileTest(p, now + 3_600_001).rows[0].state, "stale");
  p.file = await snapshot(SYNTHETIC_FILE.replaceAll(receivedAt, "2000-01-01T12:01:00.000Z"));
  assert.equal(evaluateFileTest(p, now).rows[0].state, "future");
  p.file = await snapshot(SYNTHETIC_FILE.replaceAll(receivedAt, "2000-01-01T12:06:00.000Z"));
  assert.throws(() => evaluateFileTest(p, now));
  const missing = createFileTestPortfolio(); assert.equal(evaluateFileTest(missing, now).observedTotalRial, null);
  missing.inputs.quantitiesMilli.GOLD_18K_IRR = 0; missing.inputs.quantitiesMilli.EMAMI_COIN_IRR = 0;
  assert.equal(evaluateFileTest(missing, now).currentTotalRial, "100000000");
});

test("snapshot/portfolio validation rejects drift, unknown fields, unsafe amounts and mixed provenance", async () => {
  const p = await portfolio();
  const mutations = [q => q.version = "v2", q => q.ownerSecret = "not-real", q => q.inputs.cashRial = "invalid", q => q.inputs.quantitiesMilli.EMAMI_COIN_IRR = 500,
    q => q.file.datasetKind = "real_market_snapshot", q => q.file.version = "v2", q => q.file.profileVersion = "rahavard",
    q => q.file.fileSha256 = "bad", q => q.file.fileBytes++, q => q.file.extra = true,
    q => q.file.observations[0].priceRial = "1", q => q.file.observations[0].source = "rahavard",
    q => q.file.receivedAt = "2000-01-01T12:06:00.000Z"];
  for (const mutation of mutations) { const q = structuredClone(p); mutation(q); assert.throws(() => evaluateFileTest(q, now)); }
  for (const bad of [null, [], {}, { ...p, file: [] }]) assert.throws(() => evaluateFileTest(bad, now));
  assert.throws(() => evaluateFileTest(p, NaN));
});

test("canonical save/replay verifies original text, SHA and reproduced result, not vendor authenticity", async () => {
  const p = await portfolio();
  const encoded = await encodeFileTest(p, now); const decoded = await decodeFileTest(encoded, now + 3_600_001);
  assert.deepEqual(decoded, p); assert.equal(evaluateFileTest(decoded, now + 3_600_001).currentTotalRial, null);
  const bom = await portfolio("\uFEFF" + SYNTHETIC_FILE.replaceAll("\n", "\r\n"));
  assert.deepEqual(await decodeFileTest(await encodeFileTest(bom, now), now), bom);
  const changes = [d => d.version = "v2", d => d.result.observedTotalRial = "1", d => d.portfolio.file.fileSha256 = "0".repeat(64), d => d.evaluatedAt = "2000-01-01T12:06:00.000Z", d => d.secret = "test"];
  for (const change of changes) { const d = JSON.parse(encoded); change(d); await assert.rejects(() => decodeFileTest(canonical(d), now)); }
  await assert.rejects(() => decodeFileTest(" "+encoded, now));
  await assert.rejects(() => decodeFileTest('{"version":"duplicate",'+encoded.slice(1), now));
  await assert.rejects(() => decodeFileTest(" ".repeat(30_001), now));
  await assert.rejects(() => decodeFileTest("invalid", now));
});

test("storage isolation and failed writes/reads preserve previous versions without clearing them", async () => {
  const data = new Map([["asha-real-market-test-v1", "old-real"], ["personal-portfolio", "old-personal"]]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.deepEqual(await restoreFileTest(storage, now), { raw: null, portfolio: null });
  const p = await portfolio(); const saved = await saveFileTest(storage, p, now, null);
  assert.deepEqual((await restoreFileTest(storage, now)).portfolio, p);
  assert.equal(data.get("asha-real-market-test-v1"), "old-real"); assert.equal(data.get("personal-portfolio"), "old-personal");
  p.inputs.cashRial = "99";
  await assert.rejects(() => saveFileTest(storage, p, now, null), /بازنویسی/);
  await assert.rejects(() => saveFileTest({ ...storage, setItem: () => { throw Error("quota"); } }, p, now, saved), /quota/);
  assert.equal(data.get(FILE_TEST_STORAGE), saved);
  data.set(FILE_TEST_STORAGE, "corrupt");
  await assert.rejects(() => restoreFileTest(storage, now));
  await assert.rejects(() => saveFileTest(storage, p, now, saved));
  assert.equal(data.get(FILE_TEST_STORAGE), "corrupt");
  await assert.rejects(() => restoreFileTest({ getItem: () => { throw Error("denied"); } }, now), /denied/);
});

test("browser implementation exposes all views and explicit limits without network, auto-import or private persistence", () => {
  const ui = readFileSync(new URL("../app/file-market-workspace.tsx", import.meta.url), "utf8");
  const parent = readFileSync(new URL("../app/market-test-workspace.tsx", import.meta.url), "utf8");
  for (const view of ["overview", "portfolio", "asset-center", "analysis", "decisions", "risk", "data", "market", "agents"]) assert.ok(ui.includes(`"${view}"`));
  for (const marker of ["SHA-256", "تصمیم‌ناپذیر", "کاملاً ساختگی", "قالب واقعی رهاورد هنوز تأیید نشده", "arrayBuffer", "file.size > MAX_FILE_BYTES"]) assert.ok(ui.includes(marker));
  assert.ok(parent.includes("FileMarketWorkspace"));
  const root = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.ok(root.includes("نوع و منبع داده در نمای فعال مشخص است"));
  assert.doesNotMatch(root, /قیمت منبع واقعی · موجودی فرضی/);
  const css = readFileSync(new URL("../app/market-test-workspace.css", import.meta.url), "utf8");
  assert.match(css, /\.market-test-workspace \.table-scroll\{[^}]*overflow-x:auto/);
  assert.doesNotMatch(ui, /fetch\(|removeItem\(|localStorage\.clear|dangerouslySetInnerHTML|eval\(/);
});
