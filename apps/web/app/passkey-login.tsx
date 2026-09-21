"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnAbortService } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { PASSKEY_INTENTS, PASSKEY_PATHS } from "../auth/passkey-types";

const unsupported = "این مرورگر یا اتصال از کلید عبور پشتیبانی نمی‌کند. نشانی امن سایت را در مرورگر به‌روز باز کن؛ قفل دستگاه یا کلید امنیتی سازگار لازم است.";
const subscribeSupport = () => () => {};
const browserSupport = () => typeof window !== "undefined" && window.isSecureContext && browserSupportsWebAuthn();
const serverSupport = () => null;
class PasskeyRequestError extends Error {
  readonly status: number;
  constructor(status: number) { super("Passkey request unconfirmed"); this.status = status; }
}
function safeMessage(error: unknown, registration: boolean, authenticated: boolean) {
  if (error instanceof PasskeyRequestError && error.status === 429) return "درخواست‌ها زیاد شده است؛ کمی صبر کن و دوباره تلاش کن.";
  if (error instanceof PasskeyRequestError && error.status === 503) return "ورود امن هنوز آماده نیست یا اتصال برقرار نشد. تا رفع مشکل، سبد باز نمی‌شود.";
  if (error instanceof PasskeyRequestError && error.status === 401 && registration) return authenticated
    ? "افزودن کلید به ورود تازه نیاز دارد. پس از ذخیرهٔ پیش‌نویس، خارج شو و دوباره با کلید عبور وارد شو."
    : "ثبت کلید تأیید نشد؛ کد راه‌اندازی ممکن است نامعتبر، منقضی یا استفاده‌شده باشد. ثبت‌نام عمومی وجود ندارد.";
  if (error && typeof error === "object" && "name" in error) {
    if (error.name === "NotAllowedError" || error.name === "AbortError") return "تأیید دستگاه کامل نشد یا لغو شد. فقط اگر قصد ادامه داری دوباره تلاش کن.";
    if (error.name === "NotSupportedError" || error.name === "SecurityError") return unsupported;
    if (error.name === "InvalidStateError") return "ممکن است این کلید قبلاً ثبت شده باشد. با کلید موجود وارد شو یا برای کلید دوم از دستگاه دیگری استفاده کن.";
  }
  return registration ? "ثبت کلید تأیید نشد. اگر پاسخ قطع شد، ابتدا ورود با همان کلید را امتحان کن؛ کد راه‌اندازی را دوباره منتشر نکن." : "ورود تأیید نشد. اتصال و کلید انتخاب‌شده را بررسی کن؛ اطلاعات سبد پنهان می‌ماند.";
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
async function responseJson(response: Response, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new PasskeyRequestError(response.status); }
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") || !response.body) throw Error("Invalid passkey response");
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, text = "", timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    abort = () => reject(Error("Passkey response interrupted"));
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(abort, 5000);
    if (signal.aborted) abort();
  });
  try {
    for (let chunks = 0; chunks < 256; chunks++) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) { const value: unknown = JSON.parse(text + decoder.decode()); if (!record(value)) throw Error("Invalid passkey response"); return value; }
      size += part.value.byteLength;
      if (size > 65_536) throw Error("Passkey response too large");
      text += decoder.decode(part.value, { stream: true });
    }
    throw Error("Passkey response too fragmented");
  } finally { clearTimeout(timer); if (abort) signal.removeEventListener("abort", abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function post(path: string, intent: string, signal: AbortSignal, value?: unknown) {
  const body = value === undefined ? undefined : JSON.stringify(value);
  if (body !== undefined && new TextEncoder().encode(body).length > 65_536) throw Error("Passkey request too large");
  const response = await fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
    headers: { "X-ASHA-Intent": intent, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body,
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
  return responseJson(response, signal);
}

export interface PasskeyLoginProps {
  authenticated?: boolean;
  disabled?: boolean;
  onBegin: () => number;
  onAuthenticated: (generation: number) => Promise<void>;
}

/** Explicit ceremonies only. Grants and credentials remain transient: never
 * put them in a URL, browser storage, logging, error text or a rendered result. */
export function PasskeyLogin({ authenticated = false, disabled = false, onBegin, onAuthenticated }: PasskeyLoginProps) {
  const supported = useSyncExternalStore(subscribeSupport, browserSupport, serverSupport);
  const [busy, setBusy] = useState(false), [grant, setGrant] = useState(""), [message, setMessage] = useState("");
  const [previousDisabled, setPreviousDisabled] = useState(disabled);
  // Reset this transient input on a parent lock, without waiting for a network
  // cancellation or briefly exposing a retained grant when controls reopen.
  if (disabled !== previousDisabled) { setPreviousDisabled(disabled); if (disabled) setGrant(""); }
  const lifecycle = useRef({ active: false, mounted: false, sequence: 0, controller: null as AbortController | null });
  useEffect(() => {
    const state = lifecycle.current; state.mounted = true;
    return () => { state.mounted = false; state.sequence++; state.controller?.abort(); if (state.active) WebAuthnAbortService.cancelCeremony(); state.active = false; };
  }, []);
  useEffect(() => {
    const state = lifecycle.current;
    if (disabled) { state.controller?.abort(); if (state.active) WebAuthnAbortService.cancelCeremony(); }
  }, [disabled]);
  const perform = async (registration: boolean) => {
    const state = lifecycle.current;
    if (state.active || disabled || supported !== true) return;
    if (registration && !authenticated && !/^[A-Za-z0-9_-]{43}$/.test(grant)) { setMessage("کد کامل یک‌بارمصرف راه‌اندازی مالک را وارد کن."); return; }
    state.active = true; const run = ++state.sequence, abort = new AbortController(); state.controller = abort;
    let bootstrapToken: string | undefined = registration && !authenticated ? grant : undefined;
    setGrant(""); setBusy(true); setMessage(registration ? "ثبت کلید را روی دستگاه تأیید کن…" : "ورود را روی دستگاه تأیید کن…");
    const current = () => state.mounted && run === state.sequence && !abort.signal.aborted;
    try {
      if (registration) {
        const result = await post(PASSKEY_PATHS.registrationOptions, PASSKEY_INTENTS.register, abort.signal, bootstrapToken ? { bootstrapToken } : {});
        bootstrapToken = undefined;
        if (!current()) return;
        if (Object.keys(result).join(",") !== "options" || !record(result.options) || !record(result.options.authenticatorSelection)
          || result.options.authenticatorSelection.userVerification !== "required" || result.options.attestation !== "none") throw Error("Unsafe registration options");
        const credential = await startRegistration({ optionsJSON: result.options as unknown as PublicKeyCredentialCreationOptionsJSON });
        if (!current()) return;
        const verified = await post(PASSKEY_PATHS.registrationVerify, PASSKEY_INTENTS.register, abort.signal, credential);
        if (!current()) return;
        if (Object.keys(verified).join(",") !== "registered" || verified.registered !== true) throw Error("Registration unconfirmed");
        setMessage(authenticated ? "کلید دوم ثبت شد. آن را جدا از کلید نخست نگه دار؛ هیچ کلید قبلی حذف نشد." : "کلید ثبت شد. اکنون دکمهٔ «ورود با کلید عبور» را بزن؛ ثبت کلید به‌تنهایی ورود نیست.");
      } else {
        const ownerGeneration = onBegin();
        const result = await post(PASSKEY_PATHS.authenticationOptions, PASSKEY_INTENTS.authenticate, abort.signal);
        if (!current()) return;
        if (Object.keys(result).join(",") !== "options" || !record(result.options) || result.options.userVerification !== "required") throw Error("Unsafe authentication options");
        const credential = await startAuthentication({ optionsJSON: result.options as unknown as PublicKeyCredentialRequestOptionsJSON });
        if (!current()) return;
        const verified = await post(PASSKEY_PATHS.authenticationVerify, PASSKEY_INTENTS.authenticate, abort.signal, credential);
        if (!current()) return;
        if (Object.keys(verified).sort().join(",") !== "authenticated,expiresAt,subject" || verified.authenticated !== true
          || typeof verified.subject !== "string" || !verified.subject || !Number.isSafeInteger(verified.expiresAt) || (verified.expiresAt as number) <= Date.now()) throw Error("Authentication unconfirmed");
        await onAuthenticated(ownerGeneration); // Parent must recheck the actual server session.
      }
    } catch (error) { if (current()) setMessage(safeMessage(error, registration, authenticated)); }
    finally { bootstrapToken = undefined; if (run === state.sequence) { state.active = false; state.controller = null; if (state.mounted) setBusy(false); } }
  };
  return <section aria-label={authenticated ? "امنیت کلید عبور" : "ورود با کلید عبور"}>
    {!authenticated && <><button type="button" className="primary-button" disabled={disabled || busy || supported !== true} onClick={() => void perform(false)}>ورود با کلید عبور</button><p>با تأیید قفل دستگاه یا کلید امنیتی وارد شو؛ نیازی به حساب گوگل نیست.</p></>}
    {supported === false && <p role="status">{unsupported}</p>}
    {supported === null && <p role="status">در حال بررسی پشتیبانی دستگاه…</p>}
    <details onToggle={event => { if (!event.currentTarget.open) setGrant(""); }}>
      <summary>{authenticated ? "افزودن کلید دوم برای بازیابی دسترسی" : "راه‌اندازی نخستین کلید مالک"}</summary>
      <p>{authenticated ? "تا پنج دقیقه پس از ورود تازه می‌توانی کلید دیگری اضافه کنی. این کار کلید قبلی را حذف نمی‌کند. اگر ورود تازه لازم شد، ابتدا پیش‌نویس را ذخیره کن." : "فقط کدی را وارد کن که جداگانه و به‌صورت امن به مالک تحویل شده است. ثبت‌نام عمومی وجود ندارد؛ برنامه این کد را ذخیره نمی‌کند."}</p>
      <form method="post" onSubmit={event => { event.preventDefault(); void perform(true); }}>
        {!authenticated && <label>کد یک‌بارمصرف راه‌اندازی<input type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr" maxLength={43} value={grant} disabled={disabled || busy} onChange={event => setGrant(event.target.value)} /></label>}
        <button type="submit" className="ghost-button" disabled={disabled || busy || supported !== true}>{authenticated ? "ثبت کلید دوم" : "ثبت نخستین کلید"}</button>
      </form>
    </details>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
