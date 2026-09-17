export const LOCAL_BACKUP_INTERVAL_MS = 24 * 60 * 60_000;
export const LOCAL_BACKUP_RETRY_MS = 60 * 60_000;
export type LocalBackupStatus = {
  version: "asha.local_backup_status.v1";
  state: "verified" | "running" | "overdue";
  lastVerifiedAt: string | null;
  checkedAt: string;
  nextDueAt: string | null;
  reason: "recent_verified_backup" | "backup_running" | "backup_failed" | "verification_metadata_unavailable";
};
type Options = {
  inspect: () => Promise<string | null>;
  runBackup: (signal: AbortSignal) => Promise<boolean>;
  report: (status: LocalBackupStatus) => Promise<void> | void;
  clock?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

// This scheduler exists only while the owner-local launcher is running. It does
// not install an OS task, delete/rotate backups, or certify off-device recovery.
export function startLocalBackupSupervisor({ inspect, runBackup, report, clock = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }: Options) {
  let stopped = false, inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active: AbortController | null = null;
  const validTime = (value: string | null) => value !== null && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value && Date.parse(value) <= clock();
  const emit = async (state: LocalBackupStatus["state"], reason: LocalBackupStatus["reason"], lastVerifiedAt: string | null) => {
    if (stopped) return;
    try { await report({ version: "asha.local_backup_status.v1", state, reason, lastVerifiedAt,
      checkedAt: new Date(clock()).toISOString(), nextDueAt: lastVerifiedAt ? new Date(Date.parse(lastVerifiedAt) + LOCAL_BACKUP_INTERVAL_MS).toISOString() : null }); }
    catch { /* Reporting failure must not stop future backup attempts. */ }
  };
  function schedule(delay: number) {
    if (stopped) return;
    timer = setTimer(() => { timer = null; void check(); }, Math.max(1000, Math.min(LOCAL_BACKUP_INTERVAL_MS, delay)));
    timer.unref?.();
  }
  async function cycle() {
    let last: string | null = null;
    try { last = await inspect(); if (!validTime(last)) last = null; }
    catch { await emit("overdue", "verification_metadata_unavailable", null); }
    if (stopped) return;
    if (last && clock() - Date.parse(last) < LOCAL_BACKUP_INTERVAL_MS) {
      await emit("verified", "recent_verified_backup", last);
      schedule(Date.parse(last) + LOCAL_BACKUP_INTERVAL_MS - clock()); return;
    }
    await emit("running", "backup_running", last);
    if (stopped) return;
    active = new AbortController();
    let completed = false;
    try { completed = await runBackup(active.signal); } catch { /* Safe status only; never reflect child errors. */ }
    finally { active = null; }
    if (stopped) return;
    if (completed) {
      try {
        const updated = await inspect();
        if (validTime(updated) && clock() - Date.parse(updated!) < LOCAL_BACKUP_INTERVAL_MS) {
          await emit("verified", "recent_verified_backup", updated);
          schedule(Date.parse(updated!) + LOCAL_BACKUP_INTERVAL_MS - clock()); return;
        }
      } catch { /* Exit zero alone is not evidence of a verified retained dump. */ }
    }
    await emit("overdue", "backup_failed", last);
    schedule(LOCAL_BACKUP_RETRY_MS);
  }
  function check(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (inFlight) return inFlight;
    if (timer) { clearTimer(timer); timer = null; }
    inFlight = cycle().finally(() => { inFlight = null; });
    return inFlight;
  }
  void check();
  return { check, stop() { stopped = true; if (timer) clearTimer(timer); timer = null; active?.abort(); } };
}
