"use client";

import { useEffect, useRef, useState } from "react";
import { OWNER_ACCESS_LOST, ownerAction, readAccessMode, readOwnerSession } from "./access-client";
import { UnifiedPortfolioWorkspace } from "./unified-portfolio-workspace";

export function OwnerWorkspace() {
  const [mode, setMode] = useState<"local" | "private" | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [message, setMessage] = useState("در حال بررسی دسترسی…");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const resumeBlocked = useRef(false);
  const [curtain, setCurtain] = useState(false);
  useEffect(() => {
    let stopped = false;
    const started = ++generation.current;
    void readAccessMode().then(async (value) => {
      if (stopped || started !== generation.current) return;
      setMode(value);
      if (value === "private") {
        const expires = await readOwnerSession();
        if (!stopped && started === generation.current && !resumeBlocked.current) { setExpiresAt(expires); setCurtain(false); setMessage(expires ? "" : "برای دیدن سبد، با حساب مالک وارد شو."); }
      }
    }).catch(() => { if (!stopped && started === generation.current && !resumeBlocked.current) setMessage("دسترسی تأیید نشد؛ اطلاعات سبد نمایش داده نمی‌شود. اتصال را بررسی کن."); });
    return () => { stopped = true; };
  }, [attempt]);
  useEffect(() => {
    if (mode !== "private") return;
    let stopped = false, pending = false;
    const loseAccess = () => { generation.current++; setExpiresAt(null); setMessage("ورود نیازمند بررسی دوباره است. اگر هنگام ثبت قطع شد، پس از ورود ابتدا وضعیت ذخیره را بررسی کن."); };
    const check = async () => {
      if (pending || stopped || resumeBlocked.current || document.visibilityState === "hidden") return;
      const started = generation.current; pending = true;
      try {
        const expires = await readOwnerSession();
        if (!stopped && started === generation.current && !resumeBlocked.current) { if (expires === null) loseAccess(); else { setExpiresAt(expires); setCurtain(false); } }
      } catch { if (!stopped && started === generation.current && !resumeBlocked.current) { setCurtain(true); setMessage("اتصال برای بررسی ورود برقرار نیست؛ صفحه تا تأیید دوباره پنهان است."); } }
      finally { pending = false; }
    };
    // BFCache and tab changes are not proof of a live session: conceal first.
    const conceal = () => { generation.current++; setCurtain(true); };
    const visibility = () => { conceal(); void check(); };
    const interval = window.setInterval(check, 15_000);
    window.addEventListener(OWNER_ACCESS_LOST, loseAccess);
    window.addEventListener("offline", conceal);
    window.addEventListener("pageshow", visibility);
    document.addEventListener("visibilitychange", visibility);
    return () => { stopped = true; window.clearInterval(interval); window.removeEventListener(OWNER_ACCESS_LOST, loseAccess); window.removeEventListener("offline", conceal); window.removeEventListener("pageshow", visibility); document.removeEventListener("visibilitychange", visibility); };
  }, [mode]);
  useEffect(() => {
    if (expiresAt === null) return;
    const timer = window.setTimeout(() => { generation.current++; setExpiresAt(null); setMessage("زمان ورود تمام شد؛ دوباره وارد شو."); }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  const act = async (action: "login" | "logout") => {
    if (busy) return;
    resumeBlocked.current = true; generation.current++; setBusy(true); setExpiresAt(null);
    try {
      const redirect = await ownerAction(action);
      if (redirect) window.location.assign(redirect);
      else setMessage("از حساب خارج شدی.");
    } catch { setMessage(action === "logout" ? "خروج روی سرور تأیید نشد؛ اطلاعات این صفحه پنهان شد. اتصال را بررسی و خروج را دوباره بزن." : "ورود شروع نشد؛ اتصال یا تنظیمات ورود نیازمند بررسی است."); }
    finally { generation.current++; setBusy(false); }
  };
  if (mode === "local") return <UnifiedPortfolioWorkspace />;
  return <>
    <header className="unified-status" aria-label="دسترسی خصوصی"><b>اشا · حساب خصوصی</b>{mode === "private" && <button className="ghost-button" disabled={busy} onClick={() => void act("logout")}>خروج امن</button>}</header>
    {mode === "private" && expiresAt !== null && !busy ? <><div hidden={curtain} inert={curtain}><UnifiedPortfolioWorkspace storageLocation="server" /></div>{curtain && <p role="status">{message || "در حال بررسی دوبارهٔ ورود…"}</p>}</> : <main className="unified-workspace"><section className="panel"><h1>ورود به سبد شخصی</h1><p role="status">{message}</p>{mode === "private" && <button className="primary-button" disabled={busy} onClick={() => void act("login")}>ورود با گوگل</button>}<button className="ghost-button" disabled={busy} onClick={() => { resumeBlocked.current = false; setMode(null); setExpiresAt(null); setAttempt(value => value + 1); }}>بررسی دوبارهٔ دسترسی</button></section></main>}
  </>;
}
