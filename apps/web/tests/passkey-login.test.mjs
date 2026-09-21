import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import ts from "typescript";
import { PASSKEY_PATHS, PASSKEY_INTENTS } from "../auth/passkey-types.ts";

const source = readFileSync(new URL("../app/passkey-login.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const now = Date.parse("2000-01-03T12:00:00.000Z"), token = "a".repeat(43);
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value?.props ? [value, ...nodes(value.props.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join("") : value?.props ? text(value.props.children) : typeof value === "string" ? value : "";
const credential = { id: "synthetic-credential", type: "public-key", response: { synthetic: true } };
const authOptions = { challenge: "synthetic-challenge", rpId: "portfolio.invalid", userVerification: "required" };
const regOptions = { challenge: "synthetic-challenge", rp: { id: "portfolio.invalid", name: "Synthetic" }, user: { id: "synthetic", name: "owner", displayName: "owner" }, pubKeyCredParams: [{ type: "public-key", alg: -7 }], authenticatorSelection: { userVerification: "required" }, attestation: "none" };
function defaultResponse(path) {
  if (path === PASSKEY_PATHS.authenticationOptions) return Response.json({ options: authOptions });
  if (path === PASSKEY_PATHS.registrationOptions) return Response.json({ options: regOptions });
  if (path === PASSKEY_PATHS.authenticationVerify) return Response.json({ authenticated: true, subject: "synthetic-owner", expiresAt: now + 30_000 });
  if (path === PASSKEY_PATHS.registrationVerify) return Response.json({ registered: true });
  assert.fail("Unexpected endpoint");
}
// Execute actual shipped component/effects with synthetic transports. This does
// not claim real biometrics, authenticator enrollment or hydrated-browser proof.
function harness({ supported = true, secure = true, request = defaultResponse, authenticate = async () => credential, register = async () => credential, confirm = async () => {}, authenticated = false } = {}) {
  let cursor = 0, tree, unmounted = false, lateWrites = 0, cancellations = 0, starts = 0;
  const slots = [], effects = [], calls = [], ceremonies = [], confirmations = [];
  const same = (a, b) => a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = { value }; return [slots[index].value, next => { if (unmounted) { lateWrites++; return; } slots[index].value = typeof next === "function" ? next(slots[index].value) : next; }]; },
    useRef(current) { const index = cursor++; if (!(index in slots)) slots[index] = { current }; return slots[index]; },
    useEffect(callback, dependencies) { const index = cursor++, previous = slots[index]; if (!same(previous?.dependencies, dependencies)) effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: callback() }; }); },
  };
  const dependencies = {
    react, "../auth/passkey-types": { PASSKEY_PATHS, PASSKEY_INTENTS },
    "@simplewebauthn/browser": {
      browserSupportsWebAuthn: () => supported,
      startAuthentication: value => { ceremonies.push({ kind: "authentication", value }); return authenticate(value); },
      startRegistration: value => { ceremonies.push({ kind: "registration", value }); return register(value); },
      WebAuthnAbortService: { cancelCeremony() { cancellations++; } },
    },
  };
  class Clock extends Date { static now() { return now; } }
  const exports = {};
  new Function("require", "exports", "React", "window", "fetch", "Date", compiled)(name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; }, exports, React, { isSecureContext: secure }, async (path, options) => { calls.push({ path, options }); return request(path, options, calls.length); }, Clock);
  const props = { authenticated, disabled: false, onBegin: () => ++starts, onAuthenticated: async value => { confirmations.push(value); return confirm(value); } };
  const render = () => { assert.equal(unmounted, false); cursor = 0; tree = exports.PasskeyLogin(props); while (effects.length) effects.shift()(); return tree; };
  const settle = async () => { for (let i = 0; i < 4; i++) { await flush(); if (!unmounted) render(); } };
  return {
    async start() { render(); await settle(); }, render, settle,
    click() { const button = nodes(tree).find(node => node.type === "button" && text(node) === "ورود با کلید عبور"); assert.ok(button); assert.notEqual(button.props.disabled, true); button.props.onClick(); render(); },
    submit() { const form = nodes(tree).find(node => node.type === "form"); let prevented = false; form.props.onSubmit({ preventDefault() { prevented = true; } }); assert.equal(prevented, true); render(); },
    input(value) { const input = nodes(tree).find(node => node.type === "input"); assert.ok(input); input.props.onChange({ target: { value } }); render(); },
    collapse() { nodes(tree).find(node => node.type === "details").props.onToggle({ currentTarget: { open: false } }); render(); },
    disable() { props.disabled = true; render(); },
    unmount() { unmounted = true; for (const slot of slots) slot.cleanup?.(); },
    get text() { return text(tree); }, get inputValue() { return nodes(tree).find(node => node.type === "input")?.props.value; },
    get button() { return nodes(tree).find(node => node.type === "button"); }, get inputProps() { return nodes(tree).find(node => node.type === "input")?.props; },
    get lateWrites() { return lateWrites; }, get cancellations() { return cancellations; }, get starts() { return starts; },
    calls, ceremonies, confirmations,
  };
}

test("no requests or automatic ceremonies until explicit click; unsupported/insecure devices stay closed", async () => {
  for (const configuration of [{}, { supported: false }, { secure: false }]) {
    const ui = harness(configuration); await ui.start(); assert.equal(ui.calls.length, 0); assert.equal(ui.ceremonies.length, 0);
    if (configuration.supported === false || configuration.secure === false) { assert.equal(ui.button.props.disabled, true); assert.match(ui.text, /مرورگر.*پشتیبانی نمی‌کند/); }
    ui.unmount();
  }
});

test("login uses only fixed same-origin endpoints, exact intent and verified session confirmation", async () => {
  const ui = harness(); await ui.start(); ui.click(); await ui.settle();
  assert.deepEqual(ui.calls.map(call => call.path), [PASSKEY_PATHS.authenticationOptions, PASSKEY_PATHS.authenticationVerify]);
  for (const { options } of ui.calls) { assert.equal(options.method, "POST"); assert.equal(options.credentials, "same-origin"); assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error"); assert.equal(options.headers["X-ASHA-Intent"], "owner-login"); assert.ok(options.signal instanceof AbortSignal); }
  assert.equal(ui.calls[0].options.body, undefined); assert.deepEqual(JSON.parse(ui.calls[1].options.body), credential);
  assert.deepEqual(ui.ceremonies, [{ kind: "authentication", value: { optionsJSON: authOptions } }]); assert.deepEqual(ui.confirmations, [1]); ui.unmount();
});

test("initial registration keeps the grant transient and never logs in automatically", async () => {
  const options = deferred();
  const ui = harness({ request: (path, ...args) => path === PASSKEY_PATHS.registrationOptions ? options.promise : defaultResponse(path, ...args) });
  await ui.start(); ui.input(token); assert.equal(ui.inputProps.type, "password"); assert.equal(ui.inputProps.autoComplete, "off"); assert.equal(ui.inputProps.name, undefined);
  ui.submit(); assert.equal(ui.inputValue, ""); assert.equal(ui.calls.length, 1); assert.deepEqual(JSON.parse(ui.calls[0].options.body), { bootstrapToken: token });
  options.resolve(defaultResponse(PASSKEY_PATHS.registrationOptions)); await ui.settle();
  assert.deepEqual(ui.calls.map(call => call.path), [PASSKEY_PATHS.registrationOptions, PASSKEY_PATHS.registrationVerify]); assert.ok(ui.calls.every(call => call.options.headers["X-ASHA-Intent"] === "owner-register"));
  assert.deepEqual(ui.ceremonies, [{ kind: "registration", value: { optionsJSON: regOptions } }]); assert.equal(ui.confirmations.length, 0); assert.equal(ui.starts, 0);
  assert.match(ui.text, /ثبت کلید به‌تنهایی ورود نیست/); assert.doesNotMatch(ui.text, new RegExp(token)); ui.unmount();
});

test("invalid manual grants do not reach the server; collapse clears input and no persistence/URL/log channel exists", async () => {
  const ui = harness(); await ui.start();
  for (const grant of ["", "short", token + " ", "!".repeat(43)]) { ui.input(grant); ui.submit(); assert.equal(ui.calls.length, 0); }
  ui.input(token); ui.collapse(); assert.equal(ui.inputValue, ""); ui.unmount();
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|console\.|location\.|URLSearchParams|dangerouslySetInnerHTML/);
});

test("authenticated second-key action submits no grant, preserves authentication and explains fresh-login gate", async () => {
  const ui = harness({ authenticated: true }); await ui.start(); assert.equal(ui.inputProps, undefined); ui.submit(); await ui.settle();
  assert.deepEqual(JSON.parse(ui.calls[0].options.body), {}); assert.equal(ui.confirmations.length, 0); assert.equal(ui.starts, 0); assert.match(ui.text, /کلید دوم ثبت شد/); ui.unmount();
  const expired = harness({ authenticated: true, request: async () => Response.json({ error: "RAW_SECRET" }, { status: 401 }) });
  await expired.start(); expired.submit(); await expired.settle(); assert.match(expired.text, /پس از ذخیرهٔ پیش‌نویس/); assert.doesNotMatch(expired.text, /RAW_SECRET/); assert.equal(expired.ceremonies.length, 0); expired.unmount();
});

test("weakened UV/attestation or unexpected envelopes never invoke an authenticator", async () => {
  for (const registration of [false, true]) for (const body of [{ options: registration ? { ...regOptions, authenticatorSelection: { userVerification: "preferred" } } : { ...authOptions, userVerification: "preferred" } }, { options: registration ? { ...regOptions, attestation: "direct" } : {}, debug: "RAW_SECRET" }, []]) {
    const ui = harness({ request: async () => Response.json(body) }); await ui.start(); if (registration) { ui.input(token); ui.submit(); } else ui.click(); await ui.settle();
    assert.equal(ui.ceremonies.length, 0); assert.equal(ui.confirmations.length, 0); assert.doesNotMatch(ui.text, /RAW_SECRET/); ui.unmount();
  }
});

test("malformed verification and unavailable server session never report completed login", async () => {
  for (const verified of [{ authenticated: false }, { authenticated: true, subject: "synthetic", expiresAt: now }, { authenticated: true, subject: "synthetic", expiresAt: now + 1000, debug: "RAW_SECRET" }]) {
    const ui = harness({ request: path => path === PASSKEY_PATHS.authenticationVerify ? Response.json(verified) : defaultResponse(path) }); await ui.start(); ui.click(); await ui.settle(); assert.equal(ui.confirmations.length, 0); assert.match(ui.text, /ورود تأیید نشد/); ui.unmount();
  }
  const denied = harness({ confirm: async () => { throw Error("RAW_SECRET session unavailable"); } }); await denied.start(); denied.click(); await denied.settle(); assert.match(denied.text, /ورود تأیید نشد/); assert.doesNotMatch(denied.text, /RAW_SECRET/); denied.unmount();
});

test("cancelled/unsupported ceremonies and 401/429/503 failures show only curated safe guidance", async () => {
  for (const name of ["NotAllowedError", "AbortError", "NotSupportedError", "SecurityError", "InvalidStateError", "UnknownError"]) {
    const ui = harness({ authenticate: async () => { throw Object.assign(Error("RAW_SECRET credential"), { name }); } }); await ui.start(); ui.click(); await ui.settle(); assert.equal(ui.calls.length, 1); assert.equal(ui.confirmations.length, 0); assert.doesNotMatch(ui.text, /RAW_SECRET/); ui.unmount();
  }
  for (const status of [401, 429, 503]) { const ui = harness({ request: async () => Response.json({ secret: "RAW_SECRET" }, { status }) }); await ui.start(); ui.click(); await ui.settle(); assert.equal(ui.ceremonies.length, 0); assert.doesNotMatch(ui.text, /RAW_SECRET/); ui.unmount(); }
});

test("duplicate clicks start only one ceremony; disable/unmount prevents stale verification and aborts", async () => {
  for (const action of ["disable", "unmount"]) {
    const waiting = deferred(), ui = harness({ authenticate: () => waiting.promise }); await ui.start();
    const click = ui.button.props.onClick; click(); click(); await ui.settle(); assert.equal(ui.calls.length, 1); assert.equal(ui.ceremonies.length, 1);
    ui[action](); waiting.resolve(credential); await ui.settle(); assert.equal(ui.calls.length, 1); assert.equal(ui.confirmations.length, 0); assert.equal(ui.cancellations, 1); assert.equal(ui.lateWrites, 0);
    if (action !== "unmount") ui.unmount();
  }
});

test("invalid UTF8/JSON, wrong media, oversize and unending empty chunks fail closed", async () => {
  for (const response of [new Response("{", { headers: { "content-type": "application/json" } }), new Response(new Uint8Array([0xc3, 0x28]), { headers: { "content-type": "application/json" } }), new Response("{}"), new Response(" ".repeat(65_537), { headers: { "content-type": "application/json" } }), new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array()); } }), { headers: { "content-type": "application/json" } })]) {
    const ui = harness({ request: async () => response }); await ui.start(); ui.click(); await ui.settle(); assert.equal(ui.ceremonies.length, 0); assert.equal(ui.confirmations.length, 0); assert.match(ui.text, /ورود تأیید نشد/); ui.unmount();
  }
});

test("stalled response is bounded at five seconds without waiting for stalled cancellation", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); let cancelled = 0;
  const ui = harness({ request: async () => new Response(new ReadableStream({ cancel() { cancelled++; return new Promise(() => {}); } }), { headers: { "content-type": "application/json" } }) });
  await ui.start(); ui.click(); await ui.settle(); t.mock.timers.tick(4999); await ui.settle(); assert.equal(ui.button.props.disabled, true);
  t.mock.timers.tick(1); await ui.settle(); assert.equal(ui.button.props.disabled, false); assert.equal(cancelled, 1); assert.equal(ui.ceremonies.length, 0); ui.unmount();
});
