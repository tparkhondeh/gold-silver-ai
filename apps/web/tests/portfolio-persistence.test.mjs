import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { decodePortfolioSnapshot, fetchPortfolioSnapshot } from "../app/portfolio-persistence.ts";
import { emptyPurchaseBook, validatePurchaseBook } from "../app/purchase-book.ts";

const preferences = { liquidityReservePercent: "10", maxSingleAssetPercent: "40", maxAcceptableDrawdownPercent: "20", shortTermMonths: "6", longTermYears: "5", analysisHorizon: "short", decisionHorizon: "long" };
const holding = { id: "synthetic-holding", name: "Synthetic recovery fixture", amount: 1, unit: "test", costToman: null, purchaseDate: null, note: "" };
const first = { version: 1, holdings: [holding], preferences };
const second = { version: 2, holdings: [{ ...holding, amount: 2 }], preferences: { ...preferences, liquidityReservePercent: "20" } };
const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const handlers = source.slice(source.indexOf("  async function savePersonalPortfolioToDatabase()"), source.indexOf("  function loadDemoPortfolio()"));
const initialStart = source.lastIndexOf("  useEffect(() => {", source.indexOf('if (marketTestActive || !holdingsLoaded || portfolioMode !== "personal")'));
const initialEffect = source.slice(initialStart, source.indexOf("  }, [holdingsLoaded, portfolioMode, marketTestActive]);", initialStart) + "  }, [holdingsLoaded, portfolioMode, marketTestActive]);".length);
const transpile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } }).outputText;

// Execute the actual page handlers, with only React setters and HTTP replaced by
// synthetic doubles. This catches wiring failures that codec-only tests miss.
function pageHarness(request, snapshot = first) {
  return new Function("fetch", "readSnapshot", "decodePortfolioSnapshot", "initial", "emptyPurchaseBook", "validatePurchaseBook", `
    let portfolioMode='personal', marketTestActive=false, holdingsLoaded=true, modalOpen=false, pendingDeleteHoldingId=null;
    let portfolioPersistence={state:'ready',snapshot:structuredClone(initial)}, holdings=structuredClone(initial.holdings);
    let legacyHoldings=holdings, purchaseBook=structuredClone(initial.purchaseBook??emptyPurchaseBook()), purchaseStorageIssue=false;
    const sessionWrites=[];const sessionStorage={setItem(key,value){sessionWrites.push({key,value});}};
    const setPurchaseBook=value=>{purchaseBook=value;};const setPurchaseStorageIssue=value=>{purchaseStorageIssue=value;};
    let ownerConstraints={...initial.preferences},analysisHorizon=initial.preferences.analysisHorizon,decisionHorizon=initial.preferences.decisionHorizon,selectedHoldingId=null;
    const portfolioRequestRef={current:null};
    const setPortfolioPersistence=value=>{portfolioPersistence=value;};const setHoldings=value=>{holdings=value;legacyHoldings=value;};
    const setOwnerConstraints=value=>{ownerConstraints=value;};const setAnalysisHorizon=value=>{analysisHorizon=value;};
    const setDecisionHorizon=value=>{decisionHorizon=value;};const setSelectedHoldingId=value=>{selectedHoldingId=value;};
    const fetchPortfolioSnapshot=signal=>readSnapshot(signal,fetch);
    let initialize;const useEffect=callback=>{initialize=callback;};
    ${transpile(initialEffect)}
    ${transpile(handlers)}
    return {save:savePersonalPortfolioToDatabase,restore:restorePersonalPortfolioFromDatabase,commit:commitPurchaseBook,initialize,
      inspect:()=>({portfolioPersistence,holdings,legacyHoldings,purchaseBook,sessionWrites,ownerConstraints,analysisHorizon,decisionHorizon,selectedHoldingId,busy:portfolioRequestRef.current!==null}),
      abort:()=>{portfolioRequestRef.current?.abort();portfolioRequestRef.current=null;},
      edit:value=>{holdings=value;legacyHoldings=value;},project:value=>{holdings=value;},openModal:()=>{modalOpen=true;}};
  `)(request, fetchPortfolioSnapshot, decodePortfolioSnapshot, snapshot, emptyPurchaseBook, validatePurchaseBook);
}

test("stale-tab recovery fetches the current version and makes the following save succeed", async () => {
  let remote = structuredClone(second); const methods = [];
  const page = pageHarness(async (url, options = {}) => {
    assert.equal(url, "/api/portfolio"); methods.push(options.method ?? "GET");
    if (options.method !== "PUT") { assert.equal(options.cache, "no-store"); return Response.json({ ok: true, snapshot: remote }); }
    const input = JSON.parse(options.body);
    if (input.expectedVersion !== remote.version) return Response.json({ ok: false, code: "version_conflict" }, { status: 409 });
    remote = { version: remote.version + 1, holdings: input.holdings, preferences: input.preferences };
    return Response.json({ ok: true, snapshot: remote });
  });
  page.edit([{ ...holding, amount: 3 }]); await page.save();
  assert.equal(page.inspect().portfolioPersistence.state, "error");
  await page.restore();
  assert.deepEqual(page.inspect().holdings, second.holdings);
  assert.equal(page.inspect().ownerConstraints.liquidityReservePercent, "20");
  await page.save();
  assert.equal(page.inspect().portfolioPersistence.snapshot.version, 3);
  assert.deepEqual(methods, ["PUT", "GET", "PUT"]);
});

test("empty saved portfolios restore preferences, horizons and clear prior selection", async () => {
  const snapshot = { version: 3, holdings: [], preferences: { ...preferences, analysisHorizon: "long", decisionHorizon: "short" } };
  const page = pageHarness(async () => Response.json({ ok: true, snapshot }));
  await page.restore();
  assert.deepEqual(page.inspect().holdings, []);
  assert.equal(page.inspect().analysisHorizon, "long");
  assert.equal(page.inspect().decisionHorizon, "short");
  assert.equal(page.inspect().selectedHoldingId, null);
  assert.equal(page.inspect().portfolioPersistence.snapshot.version, 3);
});

test("restore failure leaves edited input and the prior version intact and permits retry", async () => {
  const responses = [() => { throw Error("synthetic network failure"); }, () => Response.json({ ok: true, snapshot: null }), () => Response.json({ ok: true, snapshot: second })];
  const page = pageHarness(async () => responses.shift()());
  const draft = [{ ...holding, amount: 7 }]; page.edit(draft);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.restore();
    assert.deepEqual(page.inspect().holdings, draft);
    assert.equal(page.inspect().portfolioPersistence.snapshot.version, 1);
    assert.equal(page.inspect().portfolioPersistence.state, "error");
    assert.equal(page.inspect().busy, false);
  }
  await page.restore(); assert.deepEqual(page.inspect().holdings, second.holdings);
});

test("pending restore blocks duplicate operations, and canceled results cannot replace input", async () => {
  let resolve, calls = 0;
  const page = pageHarness(async () => { calls++; return new Promise(done => { resolve = done; }); });
  const pending = page.restore();
  assert.equal(page.inspect().portfolioPersistence.state, "restoring");
  await page.restore(); await page.save(); assert.equal(calls, 1);
  page.abort(); resolve(Response.json({ ok: true, snapshot: second })); await pending;
  assert.deepEqual(page.inspect().holdings, first.holdings);
  assert.equal(page.inspect().portfolioPersistence.snapshot.version, 1);
  assert.equal(page.inspect().busy, false);
});

test("initial read owns the request slot and canceled initial responses cannot replace later state", async () => {
  let resolve, calls = 0;
  const page = pageHarness(async () => { calls++; return new Promise(done => { resolve = done; }); });
  const cleanup = page.initialize();
  await page.save(); await page.restore();
  assert.equal(calls, 1);
  assert.equal(page.inspect().portfolioPersistence.state, "checking");
  cleanup(); resolve(Response.json({ ok: true, snapshot: second }));
  await new Promise(done => setImmediate(done));
  assert.equal(page.inspect().portfolioPersistence.state, "checking");
  assert.deepEqual(page.inspect().holdings, first.holdings);
});

test("open holding editor cannot overlap a database restore", async () => {
  let calls = 0; const page = pageHarness(async () => { calls++; throw Error("must not run"); });
  page.openModal(); await page.restore(); await page.save(); assert.equal(calls, 0);
});

test("a timed-out save or restore releases the busy state without replacing the draft", async t => {
  t.mock.method(AbortSignal, "timeout", () => AbortSignal.abort(new DOMException("synthetic timeout", "TimeoutError")));
  const page = pageHarness(async (_url, options) => { assert.equal(options.signal.aborted, true); throw options.signal.reason; });
  const draft = [{ ...holding, amount: 9 }]; page.edit(draft);
  for (const operation of [page.restore, page.save]) {
    await operation();
    assert.equal(page.inspect().portfolioPersistence.state, "error");
    assert.equal(page.inspect().busy, false);
    assert.deepEqual(page.inspect().holdings, draft);
    assert.equal(page.inspect().portfolioPersistence.snapshot.version, 1);
  }
});

test("restore recovers the saved version after a write committed but its response was lost", async () => {
  let remote = first;
  const page = pageHarness(async (_url, options = {}) => {
    if (options.method === "PUT") {
      const input = JSON.parse(options.body);
      remote = { version: 2, holdings: input.holdings, preferences: input.preferences };
      throw Error("synthetic lost response after commit");
    }
    return Response.json({ ok: true, snapshot: remote });
  });
  const draft = [{ ...holding, amount: 5 }]; page.edit(draft);
  await page.save(); assert.equal(page.inspect().portfolioPersistence.state, "error");
  await page.restore();
  assert.equal(page.inspect().portfolioPersistence.snapshot.version, 2);
  assert.deepEqual(page.inspect().holdings, draft);
});

test("numeric save rejection explains limits without changing or echoing draft values", async () => {
  const page = pageHarness(async () => Response.json({ ok: false, code: "invalid_holding" }, { status: 422 }));
  const draft = [{ ...holding, amount: 1.1234567890123 }]; page.edit(draft);
  await page.save();
  const result = page.inspect();
  assert.equal(result.portfolioPersistence.state, "error");
  assert.match(result.portfolioPersistence.message, /۱۲ رقم اعشار/);
  assert.match(result.portfolioPersistence.message, /۲ رقم اعشار/);
  assert.match(result.portfolioPersistence.message, /افق‌ها عدد صحیح/);
  assert.doesNotMatch(result.portfolioPersistence.message, /1\.1234567890123|Synthetic recovery fixture/);
  assert.deepEqual(result.holdings, draft);
  assert.equal(result.portfolioPersistence.snapshot.version, 1);
});

test("actual persistence controls expose Restore for empty snapshots and disable both pending buttons", () => {
  const markup = source.split(/\r?\n/).find(line => line.includes('data-testid="portfolio-persistence"'));
  const build = new Function("React", "NumberValue", "portfolioPersistence", "portfolioBusy", "savePersonalPortfolioToDatabase", "restorePersonalPortfolioFromDatabase", transpile(`const portfolioMode='personal'; function Panel(){return <>${markup}</>;} return Panel;`));
  for (const state of ["ready", "restoring", "saving"]) {
    const Panel = build(React, ({ value }) => React.createElement("span", null, value), { state, snapshot: { version: 3, holdings: [] }, message: "test" }, state !== "ready", () => {}, () => {});
    const html = renderToStaticMarkup(React.createElement(Panel));
    assert.match(html, /data-testid="restore-portfolio-database"/);
    assert.equal((html.match(/ disabled=""/g) ?? []).length, state === "ready" ? 0 : 2);
  }
});

test("snapshot validation rejects malformed holdings/preferences before applying any field", async () => {
  for (const snapshot of [null, [], { ...first, version: -1 }, { ...first, version: 1.2 }, { ...first, holdings: [null] }, { ...first, holdings: [holding, holding] }, { ...first, holdings: [{ ...holding, amount: 0 }] }, { ...first, holdings: [{ ...holding, costToman: "1" }] }, { ...first, holdings: [{ ...holding, purchaseDate: "invalid" }] }, { ...first, preferences: { ...preferences, shortTermMonths: "100" } }, { ...first, preferences: { ...preferences, analysisHorizon: "invalid" } }]) assert.throws(() => decodePortfolioSnapshot(snapshot));
  const clone = decodePortfolioSnapshot(first); clone.holdings[0].amount = 100; assert.equal(first.holdings[0].amount, 1);
  await assert.rejects(fetchPortfolioSnapshot(undefined, async () => Response.json({ ok: false }, { status: 503 })));
});

const purchaseLot = { id: "synthetic-page-purchase", assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750,
  quantity: "1.123456789012", purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "100", fees: "0",
  note: "Synthetic handler fixture", source: { kind: "xlsx", reference: "synthetic-only" }, fx: null };
const purchaseCandidate = () => ({ ...emptyPurchaseBook(), lots: [structuredClone(purchaseLot)], imports: [{ fileSha256: "a".repeat(64), importedAt: "2000-01-01T00:00:00.000Z", lotIds: [purchaseLot.id] }] });

test("actual purchase commit sends raw legacy holdings and the whole exact book; publishes only after validated success", async () => {
  let resolve, sent;
  const page = pageHarness(async (url, options) => {
    assert.equal(url, "/api/portfolio"); assert.equal(options.method, "PUT");
    assert.equal(options.headers["X-Asha-Portfolio-Request"], "save");
    sent = JSON.parse(options.body);
    return new Promise(done => { resolve = done; });
  });
  const legacyDraft = [{ ...holding, amount: 3 }];
  page.edit(legacyDraft);
  page.project([{ ...holding, id: "purchase:GOLD_18K_IRR", amount: 4.123456789012 }]);
  const candidate = purchaseCandidate(); const before = structuredClone(candidate);
  const pending = page.commit(candidate);
  assert.deepEqual(sent, { expectedVersion: first.version, holdings: legacyDraft, preferences, purchaseBook: before });
  assert.equal(page.inspect().portfolioPersistence.state, "saving");
  assert.deepEqual(page.inspect().purchaseBook, emptyPurchaseBook()); assert.equal(page.inspect().sessionWrites.length, 0);
  candidate.lots[0].quantity = "99"; // The handler must own the validated candidate it sent.
  const saved = { version: 2, holdings: sent.holdings, preferences: sent.preferences, purchaseBook: sent.purchaseBook };
  resolve(Response.json({ ok: true, snapshot: saved })); await pending;
  assert.deepEqual(page.inspect().purchaseBook, before);
  assert.deepEqual(page.inspect().portfolioPersistence.snapshot, saved);
  assert.deepEqual(page.inspect().legacyHoldings, legacyDraft);
  assert.equal(page.inspect().portfolioPersistence.state, "ready"); assert.equal(page.inspect().busy, false);
  assert.deepEqual(page.inspect().sessionWrites, [{ key: "asha-purchase-book-v1", value: JSON.stringify(before) }]);
});

test("actual purchase 409 and 422 rejection preserve the complete candidate, local book, legacy draft and saved version", async () => {
  for (const status of [409, 422]) {
    const page = pageHarness(async () => Response.json({ ok: false, code: status === 409 ? "version_conflict" : "invalid_purchase_book", message: "private synthetic backend detail" }, { status }));
    const legacyDraft = [{ ...holding, amount: 7 }]; page.edit(legacyDraft);
    const candidate = purchaseCandidate(); const before = structuredClone(candidate);
    await assert.rejects(page.commit(candidate));
    const state = page.inspect();
    assert.equal(state.portfolioPersistence.state, "error"); assert.equal(state.busy, false);
    assert.deepEqual(state.purchaseBook, emptyPurchaseBook()); assert.deepEqual(state.legacyHoldings, legacyDraft);
    assert.deepEqual(state.portfolioPersistence.snapshot, first); assert.deepEqual(candidate, before);
    assert.equal(state.sessionWrites.length, 0);
    assert.doesNotMatch(state.portfolioPersistence.message, /private synthetic|100|1\.123456/);
    assert.match(state.portfolioPersistence.message, status === 409 ? /بازیابی/ : /اصلاح/);
  }
});

test("a lost purchase commit response requires recovery and never applies or duplicates the unconfirmed candidate", async () => {
  let remote = structuredClone(first); let writes = 0;
  const page = pageHarness(async (_url, options = {}) => {
    if (options.method !== "PUT") return Response.json({ ok: true, snapshot: remote });
    writes++; const input = JSON.parse(options.body);
    if (input.expectedVersion !== remote.version) return Response.json({ ok: false, code: "version_conflict" }, { status: 409 });
    remote = { version: remote.version + 1, holdings: input.holdings, preferences: input.preferences, purchaseBook: input.purchaseBook };
    throw Error("secret-synthetic-network-error");
  });
  const candidate = purchaseCandidate(); const before = structuredClone(candidate);
  const draft = [{ ...holding, amount: 4 }]; page.edit(draft);
  await assert.rejects(page.commit(candidate), /نامشخص.*بازیابی/);
  assert.deepEqual(page.inspect().purchaseBook, emptyPurchaseBook()); assert.deepEqual(page.inspect().legacyHoldings, draft);
  assert.deepEqual(page.inspect().portfolioPersistence.snapshot, first); assert.equal(page.inspect().sessionWrites.length, 0);
  assert.doesNotMatch(page.inspect().portfolioPersistence.message, /secret-synthetic/); assert.deepEqual(candidate, before);
  await assert.rejects(page.commit(candidate), /بازیابی/);
  assert.equal(remote.purchaseBook.lots.length, 1); assert.equal(remote.purchaseBook.imports.length, 1); assert.equal(remote.version, 2);
  await page.restore();
  assert.deepEqual(page.inspect().purchaseBook, before); assert.deepEqual(page.inspect().portfolioPersistence.snapshot, remote);
  assert.equal(page.inspect().busy, false); assert.equal(writes, 2);
});

test("purchase success must contain a valid whole snapshot and the exact submitted book before state can change", async () => {
  const candidate = purchaseCandidate();
  const expected = { version: 2, holdings: first.holdings, preferences, purchaseBook: candidate };
  for (const snapshot of [null, { ...expected, purchaseBook: emptyPurchaseBook() }, { ...expected, purchaseBook: { ...candidate, lots: [{ ...purchaseLot, quantity: "0" }] } }, { ...expected, preferences: { ...preferences, shortTermMonths: "1.5" } }]) {
    const page = pageHarness(async () => Response.json({ ok: true, snapshot }));
    await assert.rejects(page.commit(candidate), /بازیابی/);
    assert.deepEqual(page.inspect().portfolioPersistence.snapshot, first);
    assert.deepEqual(page.inspect().purchaseBook, emptyPurchaseBook()); assert.equal(page.inspect().sessionWrites.length, 0);
    assert.equal(page.inspect().busy, false); assert.deepEqual(candidate, purchaseCandidate());
  }
});

test("a newly discovered database purchase book blocks local stale commit before any PUT", async () => {
  const remote = { ...second, purchaseBook: purchaseCandidate() }; let reads = 0;
  const page = pageHarness(async (_url, options = {}) => {
    assert.notEqual(options.method, "PUT"); reads++; return Response.json({ ok: true, snapshot: remote });
  });
  page.initialize(); await new Promise(done => setImmediate(done));
  assert.deepEqual(page.inspect().portfolioPersistence.snapshot, remote); assert.deepEqual(page.inspect().purchaseBook, emptyPurchaseBook());
  const candidate = purchaseCandidate(); const before = structuredClone(candidate);
  await assert.rejects(page.commit(candidate), /بازیابی نسخهٔ دیتابیس/);
  assert.equal(reads, 1); assert.equal(page.inspect().sessionWrites.length, 0); assert.deepEqual(candidate, before);
  assert.deepEqual(page.inspect().legacyHoldings, first.holdings); assert.equal(page.inspect().busy, false);
});

test("purchase timeout and workspace cancellation preserve drafts and never publish late successful replies", async t => {
  t.mock.method(AbortSignal, "timeout", () => AbortSignal.abort(new DOMException("synthetic timeout detail", "TimeoutError")));
  const timedOut = pageHarness(async (_url, options) => { assert.equal(options.signal.aborted, true); throw options.signal.reason; });
  const candidate = purchaseCandidate();
  await assert.rejects(timedOut.commit(candidate), /نامشخص.*بازیابی/);
  assert.equal(timedOut.inspect().portfolioPersistence.state, "error"); assert.equal(timedOut.inspect().busy, false);
  assert.deepEqual(timedOut.inspect().purchaseBook, emptyPurchaseBook()); assert.equal(timedOut.inspect().sessionWrites.length, 0);
  let resolve;
  const canceled = pageHarness(async () => new Promise(done => { resolve = done; }));
  const pending = canceled.commit(candidate); canceled.abort();
  resolve(Response.json({ ok: true, snapshot: { ...first, version: 2, purchaseBook: candidate } }));
  await assert.rejects(pending, /نامشخص.*بازیابی/);
  assert.deepEqual(canceled.inspect().portfolioPersistence.snapshot, first); assert.deepEqual(canceled.inspect().purchaseBook, emptyPurchaseBook());
  assert.equal(canceled.inspect().sessionWrites.length, 0); assert.equal(canceled.inspect().busy, false);
});

// PostgreSQL JSONB emits object keys by byte length then byte ordering; array
// order and values stay unchanged. Do not let insertion order become identity.
function jsonbStyleKeys(value) {
  if (Array.isArray(value)) return value.map(jsonbStyleKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map(([key, item]) => [key, jsonbStyleKeys(item)]));
}

test("reload GET with JSONB-reordered keys recognizes the same saved book and allows the next purchase", async () => {
  const existing = purchaseCandidate();
  existing.lots[0].fx = { tomanPerUsd: "10.123456789012", rateDate: "2000-01-01", rateType: "synthetic manual", source: "synthetic user", receivedAt: "2000-01-01T00:00:00.000Z", validity: "user_entered_unverified" };
  const initial = { ...first, version: 3, purchaseBook: existing };
  const remote = { ...initial, version: 4, purchaseBook: jsonbStyleKeys(existing) };
  assert.notEqual(JSON.stringify(remote.purchaseBook), JSON.stringify(existing));
  assert.deepEqual(remote.purchaseBook, existing);
  const methods = [];
  const page = pageHarness(async (_url, options = {}) => {
    methods.push(options.method ?? "GET");
    if (options.method !== "PUT") return Response.json({ ok: true, snapshot: remote });
    const input = JSON.parse(options.body);
    assert.equal(input.expectedVersion, 4); assert.deepEqual(input.holdings, first.holdings);
    return Response.json({ ok: true, snapshot: { version: 5, holdings: input.holdings, preferences: input.preferences, purchaseBook: jsonbStyleKeys(input.purchaseBook) } });
  }, initial);
  page.initialize(); await new Promise(done => setImmediate(done));
  assert.equal(page.inspect().portfolioPersistence.state, "ready");
  const next = { ...existing, lots: [...existing.lots, { ...purchaseLot, id: "synthetic-after-reload", source: { kind: "manual", reference: null } }] };
  await page.commit(next);
  assert.deepEqual(methods, ["GET", "PUT"]);
  assert.equal(page.inspect().portfolioPersistence.state, "ready"); assert.equal(page.inspect().portfolioPersistence.snapshot.version, 5);
  assert.deepEqual(page.inspect().purchaseBook, next); assert.deepEqual(page.inspect().legacyHoldings, first.holdings);
  assert.equal(page.inspect().purchaseBook.lots[0].fx.tomanPerUsd, "10.123456789012");
  assert.deepEqual(page.inspect().purchaseBook.imports, existing.imports);
});

test("successful purchase PUT echoes with JSONB-reordered object keys are normalized before equality checking", async () => {
  const candidate = purchaseCandidate(); const before = structuredClone(candidate);
  const page = pageHarness(async (_url, options) => {
    const input = JSON.parse(options.body); const reordered = jsonbStyleKeys(input.purchaseBook);
    assert.notEqual(JSON.stringify(reordered), JSON.stringify(input.purchaseBook));
    return Response.json({ ok: true, snapshot: { version: 2, holdings: input.holdings, preferences: input.preferences, purchaseBook: reordered } });
  });
  await page.commit(candidate);
  assert.deepEqual(page.inspect().purchaseBook, before); assert.deepEqual(candidate, before);
  assert.equal(page.inspect().portfolioPersistence.state, "ready"); assert.equal(page.inspect().busy, false);
  assert.equal(JSON.stringify(page.inspect().portfolioPersistence.snapshot.purchaseBook), JSON.stringify(page.inspect().purchaseBook));
  assert.deepEqual(page.inspect().purchaseBook.imports[0].lotIds, before.imports[0].lotIds);
});
