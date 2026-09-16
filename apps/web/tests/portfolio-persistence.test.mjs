import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { decodePortfolioSnapshot, fetchPortfolioSnapshot } from "../app/portfolio-persistence.ts";

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
  return new Function("fetch", "readSnapshot", "decodePortfolioSnapshot", "initial", `
    let portfolioMode='personal', marketTestActive=false, holdingsLoaded=true, modalOpen=false, pendingDeleteHoldingId=null;
    let portfolioPersistence={state:'ready',snapshot:structuredClone(initial)}, holdings=structuredClone(initial.holdings);
    let ownerConstraints={...initial.preferences},analysisHorizon=initial.preferences.analysisHorizon,decisionHorizon=initial.preferences.decisionHorizon,selectedHoldingId=null;
    const portfolioRequestRef={current:null};
    const setPortfolioPersistence=value=>{portfolioPersistence=value;};const setHoldings=value=>{holdings=value;};
    const setOwnerConstraints=value=>{ownerConstraints=value;};const setAnalysisHorizon=value=>{analysisHorizon=value;};
    const setDecisionHorizon=value=>{decisionHorizon=value;};const setSelectedHoldingId=value=>{selectedHoldingId=value;};
    const fetchPortfolioSnapshot=signal=>readSnapshot(signal,fetch);
    let initialize;const useEffect=callback=>{initialize=callback;};
    ${transpile(initialEffect)}
    ${transpile(handlers)}
    return {save:savePersonalPortfolioToDatabase,restore:restorePersonalPortfolioFromDatabase,initialize,
      inspect:()=>({portfolioPersistence,holdings,ownerConstraints,analysisHorizon,decisionHorizon,selectedHoldingId,busy:portfolioRequestRef.current!==null}),
      abort:()=>{portfolioRequestRef.current?.abort();portfolioRequestRef.current=null;},
      edit:value=>{holdings=value;},openModal:()=>{modalOpen=true;}};
  `)(request, fetchPortfolioSnapshot, decodePortfolioSnapshot, snapshot);
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
