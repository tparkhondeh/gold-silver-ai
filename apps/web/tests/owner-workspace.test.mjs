import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import ts from "typescript";

const source = readFileSync(new URL("../app/owner-workspace.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const at = Date.parse("2000-01-03T12:00:00.000Z");
const lost = "asha:owner-access-lost";
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join("") : tree?.props ? text(tree.props.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : "";

// Execute the shipped component/effects with deterministic hook, browser and
// transport doubles. Child reconciliation tracks its rendered type/key/position
// and a synthetic draft sentinel; this is not hydrated-browser acceptance or a
// claim that real portfolio drafts survive logout/OAuth navigation.
function harness({ mode = async () => "private", session = async () => at + 30_000, action = async () => null } = {}) {
  let cursor = 0, timerId = 0, childId = 0, now = at, tree, child = null, unmounted = false;
  let modeReads = 0, sessionReads = 0, lateStateWrites = 0;
  const slots = [], effects = [], timers = new Map(), intervals = new Map(), listeners = new Map(), actions = [], redirects = [];
  const same = (a, b) => a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, next => {
        if (unmounted) { lateStateWrites++; return; }
        slots[index].value = typeof next === "function" ? next(slots[index].value) : next;
      }];
    },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(callback, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!same(previous?.dependencies, dependencies)) effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: callback() }; });
    },
  };
  const eventTarget = target => ({
    addEventListener(name, callback) { listeners.set(`${target}:${name}`, callback); },
    removeEventListener(name, callback) { if (listeners.get(`${target}:${name}`) === callback) listeners.delete(`${target}:${name}`); },
  });
  const window = {
    ...eventTarget("window"),
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback, delay) { const id = ++timerId; intervals.set(id, { callback, delay }); return id; },
    clearInterval(id) { intervals.delete(id); },
    location: { assign(url) { redirects.push(url); } },
  };
  const document = { ...eventTarget("document"), visibilityState: "visible" };
  class Clock extends Date { static now() { return now; } }
  function UnifiedPortfolioWorkspace() {}
  function PasskeyLogin() {}
  const dependencies = {
    react,
    "./unified-portfolio-workspace": { UnifiedPortfolioWorkspace },
    "./passkey-login": { PasskeyLogin },
    "./access-client": {
      OWNER_ACCESS_LOST: lost,
      readAccessMode: () => mode(++modeReads),
      readOwnerSession: () => session(++sessionReads),
      ownerAction: value => { actions.push(value); return action(value, actions.length); },
    },
  };
  const exports = {};
  new Function("require", "exports", "React", "window", "document", "Date", compiled)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name];
  }, exports, React, window, document, Clock);
  function findChild(value, path = "root", ancestors = []) {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) { const found = findChild(value[index], `${path}/${index}`, ancestors); if (found) return found; }
    } else if (value?.props) {
      if (value.type === UnifiedPortfolioWorkspace) return { node: value, path, ancestors };
      return findChild(value.props.children, `${path}/child`, [...ancestors, value]);
    }
    return null;
  }
  const render = () => {
    assert.equal(unmounted, false); cursor = 0; tree = exports.OwnerWorkspace();
    while (effects.length) effects.shift()();
    const found = findChild(tree);
    if (!found) child = null;
    else {
      if (!child || child.path !== found.path || child.key !== found.node.key) child = { id: ++childId, path: found.path, key: found.node.key, draft: "" };
      child.props = found.node.props;
      child.hidden = found.ancestors.some(node => node.props.hidden === true || node.props.inert === true);
    }
    return tree;
  };
  const settle = async () => { for (let index = 0; index < 3; index++) { await flush(); if (!unmounted) render(); } return tree; };
  return {
    render, settle,
    async start() { render(); return settle(); },
    click(label) { const button = nodes(tree).find(node => node.type === "button" && text(node) === label); assert.ok(button, label); assert.notEqual(button.props.disabled, true); button.props.onClick(); return render(); },
    poll() { for (const interval of intervals.values()) interval.callback(); return render(); },
    fire(name, target = "window") { listeners.get(`${target}:${name}`)?.(); return render(); },
    visibility(value) { document.visibilityState = value; listeners.get("document:visibilitychange")?.(); return render(); },
    advance(milliseconds) { now += milliseconds; for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); } return render(); },
    unmount() { unmounted = true; for (const slot of slots) slot.cleanup?.(); child = null; },
    get child() { return child; }, get text() { return text(tree); }, get modeReads() { return modeReads; }, get sessionReads() { return sessionReads; },
    get passkey() { return nodes(tree).find(node => node.type === PasskeyLogin)?.props; },
    get lateStateWrites() { return lateStateWrites; }, get listenerCount() { return listeners.size; }, get timerCount() { return timers.size + intervals.size; },
    actions, redirects,
  };
}

test("private workspace is absent until mode and owner session both confirm", async () => {
  const access = deferred(), identity = deferred();
  const ui = harness({ mode: () => access.promise, session: () => identity.promise });
  await ui.start(); assert.equal(ui.child, null); assert.equal(ui.sessionReads, 0);
  access.resolve("private"); await ui.settle(); assert.equal(ui.child, null); assert.equal(ui.sessionReads, 1);
  identity.resolve(at + 30_000); await ui.settle();
  assert.equal(ui.child.props.storageLocation, "server"); assert.equal(ui.child.hidden, false);
  ui.unmount(); assert.equal(ui.listenerCount, 0); assert.equal(ui.timerCount, 0);
});

test("passkey mode has one login path and opens only after a fresh authoritative session read", async () => {
  const confirmation = deferred();
  const ui = harness({ mode: async () => "passkey", session: call => call === 1 ? Promise.resolve(null) : confirmation.promise });
  await ui.start(); assert.equal(ui.child, null); assert.ok(ui.passkey); assert.doesNotMatch(ui.text, /ورود با گوگل/);
  const generation = ui.passkey.onBegin(), pending = ui.passkey.onAuthenticated(generation);
  ui.render(); assert.equal(ui.child, null); assert.equal(ui.sessionReads, 2);
  confirmation.resolve(at + 30_000); await pending; await ui.settle();
  assert.equal(ui.child.props.storageLocation, "server"); assert.equal(ui.passkey.authenticated, true); assert.deepEqual(ui.actions, []);
  ui.unmount();
});

test("passkey assertion alone, missing session, or late confirmation after logout cannot unlock", async () => {
  const missing = harness({ mode: async () => "passkey", session: async () => null });
  await missing.start(); await assert.rejects(missing.passkey.onAuthenticated(missing.passkey.onBegin()));
  await missing.settle(); assert.equal(missing.child, null); missing.unmount();
  const confirmation = deferred();
  const ui = harness({ mode: async () => "passkey", session: call => call === 1 ? Promise.resolve(null) : confirmation.promise });
  await ui.start(); const pending = ui.passkey.onAuthenticated(ui.passkey.onBegin());
  ui.click("خروج امن"); await ui.settle(); confirmation.resolve(at + 30_000); await assert.rejects(pending);
  await ui.settle(); assert.equal(ui.child, null); assert.match(ui.text, /از حساب خارج شدی/); ui.unmount();
});

test("passkey security action preserves the draft across curtains and uses existing exact expiry", async () => {
  const ui = harness({ mode: async () => "passkey" }); await ui.start();
  const initial = ui.child; initial.draft = "synthetic pending purchase"; assert.equal(ui.passkey.authenticated, true);
  ui.fire("offline"); assert.equal(ui.child, initial); assert.equal(ui.child.hidden, true); assert.equal(ui.passkey.disabled, true);
  ui.poll(); await ui.settle(); assert.equal(ui.child, initial); assert.equal(initial.draft, "synthetic pending purchase");
  ui.advance(30_000); assert.equal(ui.child, null); assert.equal(ui.passkey.authenticated, undefined); ui.unmount();
});

test("passkey session confirmation completing after unmount cannot publish state", async () => {
  const confirmation = deferred();
  const ui = harness({ mode: async () => "passkey", session: call => call === 1 ? Promise.resolve(null) : confirmation.promise });
  await ui.start(); const pending = ui.passkey.onAuthenticated(ui.passkey.onBegin());
  ui.unmount(); confirmation.resolve(at + 30_000); await assert.rejects(pending); await ui.settle();
  assert.equal(ui.child, null); assert.equal(ui.lateStateWrites, 0);
});

test("local entry uses the unchanged local workspace without owner polling or auth controls", async () => {
  const ui = harness({ mode: async () => "local", session: () => assert.fail("Unexpected owner session request") });
  await ui.start(); assert.ok(ui.child); assert.equal(ui.child.props.storageLocation, undefined);
  assert.equal(ui.sessionReads, 0); assert.equal(ui.listenerCount, 0); assert.equal(ui.timerCount, 0);
  assert.doesNotMatch(ui.text, /خروج امن|ورود با گوگل/); ui.unmount();
});

test("deferred session poll cannot reopen workspace during or after confirmed logout", async () => {
  const poll = deferred(), logout = deferred();
  const ui = harness({ session: call => call === 1 ? Promise.resolve(at + 30_000) : poll.promise, action: () => logout.promise });
  await ui.start(); ui.poll(); assert.equal(ui.sessionReads, 2);
  ui.click("خروج امن"); assert.equal(ui.child, null); assert.deepEqual(ui.actions, ["logout"]);
  ui.poll(); ui.visibility("visible"); assert.equal(ui.sessionReads, 2);
  poll.resolve(at + 60_000); await ui.settle(); assert.equal(ui.child, null);
  logout.resolve(null); await ui.settle(); assert.match(ui.text, /از حساب خارج شدی/);
  ui.poll(); ui.fire("pageshow"); await ui.settle(); assert.equal(ui.sessionReads, 2); assert.equal(ui.child, null);
  ui.unmount();
});

test("failed logout stays concealed across polls/focus until explicit access recheck", async () => {
  const logout = deferred();
  const ui = harness({ action: () => logout.promise });
  await ui.start(); ui.click("خروج امن"); logout.reject(Error("synthetic disconnected server")); await ui.settle();
  assert.equal(ui.child, null); assert.match(ui.text, /خروج روی سرور تأیید نشد/);
  ui.poll(); ui.visibility("visible"); ui.fire("pageshow"); await ui.settle();
  assert.equal(ui.sessionReads, 1); assert.equal(ui.child, null);
  ui.click("بررسی دوبارهٔ دسترسی"); await ui.settle();
  assert.equal(ui.sessionReads, 2); assert.equal(ui.child.props.storageLocation, "server"); ui.unmount();
});

test("late initial session success or failure cannot replace explicit logout outcome", async () => {
  for (const reject of [false, true]) {
    const initial = deferred(), ui = harness({ session: () => initial.promise });
    await ui.start(); assert.equal(ui.child, null);
    ui.click("خروج امن"); await ui.settle(); assert.match(ui.text, /از حساب خارج شدی/);
    if (reject) initial.reject(Error("synthetic late failure")); else initial.resolve(at + 30_000);
    await ui.settle(); assert.equal(ui.child, null); assert.match(ui.text, /از حساب خارج شدی/); ui.unmount();
  }
});

test("visibility/offline curtain retains the same mounted draft until session reconfirms", async () => {
  const recheck = deferred();
  const ui = harness({ session: call => call === 1 ? Promise.resolve(at + 30_000) : recheck.promise });
  await ui.start(); ui.child.draft = "synthetic unsaved input"; const initial = ui.child;
  ui.visibility("hidden"); assert.equal(ui.child, initial); assert.equal(ui.child.hidden, true); assert.equal(ui.sessionReads, 1);
  ui.visibility("visible"); assert.equal(ui.child, initial); assert.equal(ui.child.hidden, true); assert.equal(ui.sessionReads, 2);
  recheck.resolve(at + 60_000); await ui.settle(); assert.equal(ui.child, initial); assert.equal(ui.child.hidden, false); assert.equal(ui.child.draft, "synthetic unsaved input");
  ui.fire("offline"); assert.equal(ui.child, initial); assert.equal(ui.child.hidden, true);
  ui.unmount();
});

test("failed transient session refresh conceals rather than discards the mounted draft", async () => {
  const ui = harness({ session: call => call === 1 ? Promise.resolve(at + 30_000) : Promise.reject(Error("synthetic offline")) });
  await ui.start(); ui.child.draft = "synthetic unsaved input"; const initial = ui.child;
  ui.poll(); await ui.settle(); assert.equal(ui.child, initial); assert.equal(ui.child.hidden, true);
  assert.equal(ui.child.draft, "synthetic unsaved input"); assert.match(ui.text, /اتصال برای بررسی ورود برقرار نیست/); ui.unmount();
});

test("401 access-loss event hides workspace and invalidates an older successful poll", async () => {
  const old = deferred(), ui = harness({ session: call => call === 1 ? Promise.resolve(at + 30_000) : old.promise });
  await ui.start(); ui.poll(); ui.fire(lost); assert.equal(ui.child, null);
  old.resolve(at + 60_000); await ui.settle(); assert.equal(ui.child, null); ui.unmount();
});

test("absolute expiry hides at the exact boundary and invalidates pending publication", async () => {
  const old = deferred(), ui = harness({ session: call => call === 1 ? Promise.resolve(at + 1000) : old.promise });
  await ui.start(); ui.poll(); ui.advance(999); assert.ok(ui.child);
  ui.advance(1); assert.equal(ui.child, null); assert.match(ui.text, /زمان ورود تمام شد/);
  old.resolve(at + 60_000); await ui.settle(); assert.equal(ui.child, null); ui.unmount();
});

test("retry owns a new mode read and ignores the obsolete local-mode response", async () => {
  const old = deferred(), ui = harness({ mode: call => call === 1 ? old.promise : Promise.resolve("private") });
  await ui.start(); ui.click("بررسی دوبارهٔ دسترسی"); await ui.settle(); assert.equal(ui.child.props.storageLocation, "server");
  old.resolve("local"); await ui.settle(); assert.equal(ui.child.props.storageLocation, "server"); ui.unmount();
});

test("unmount removes all listeners/timers and late session completion publishes nothing", async () => {
  const old = deferred(), ui = harness({ session: call => call === 1 ? Promise.resolve(at + 30_000) : old.promise });
  await ui.start(); ui.poll(); ui.unmount(); old.resolve(at + 60_000); await ui.settle();
  assert.equal(ui.listenerCount, 0); assert.equal(ui.timerCount, 0); assert.equal(ui.lateStateWrites, 0);
});
