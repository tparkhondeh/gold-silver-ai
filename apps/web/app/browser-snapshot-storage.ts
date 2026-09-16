export type SnapshotStorage = Pick<Storage, "getItem" | "setItem">;
export type SnapshotLocks = Pick<LockManager, "request">;

export class SnapshotStorageError extends Error {}

// Every cooperating tab uses the same origin-scoped lock, including async TXT encoding.
// No unsafe fallback when locks are unavailable; reads/calculations still work.
export async function withSnapshotLock<T>(key: string, operation: () => T | Promise<T>, locks: SnapshotLocks | undefined = globalThis.navigator?.locks): Promise<T> {
  if (!locks) throw new SnapshotStorageError("ذخیرهٔ امن در این مرورگر در دسترس نیست؛ از مرورگر به‌روز روی آدرس لوکال یا HTTPS استفاده کن. اطلاعات قبلی تغییر نکرد.");
  return locks.request(`asha-snapshot:${key}`, { mode: "exclusive", ifAvailable: true }, async lock => {
    if (!lock) throw new SnapshotStorageError("ذخیره در تب دیگری در حال انجام است؛ کمی بعد دوباره امتحان کن. ورودی فعلی حفظ شد.");
    return operation();
  });
}

export function writeReviewedSnapshot(storage: SnapshotStorage, key: string, text: string, expectedRaw: string | null | undefined, validatePrevious: (raw: string) => unknown, backupKey?: string): string {
  if (expectedRaw === undefined) throw new SnapshotStorageError("نسخهٔ ذخیره‌شده هنوز سالم خوانده نشده؛ ابتدا بازیابی را بررسی کن. بازنویسی انجام نشد.");
  const current = storage.getItem(key);
  if (current !== expectedRaw) throw new SnapshotStorageError("نسخهٔ ذخیره در تب دیگری تغییر کرده؛ ورودی فعلی حفظ شد و نسخهٔ دیگر بازنویسی نشد. برای دیدن نسخهٔ جدید، بازیابی را بزن؛ ویرایش‌های ذخیره‌نشدهٔ این تب جایگزین می‌شوند.");
  if (current !== null) validatePrevious(current);
  // Repeated Save must not erase the useful previous version.
  if (current === text) return text;
  if (backupKey && current !== null) storage.setItem(backupKey, current);
  storage.setItem(key, text);
  return text;
}

export function snapshotFailure(error: unknown, fallback: string): string {
  // Browser/storage exceptions can contain opaque data; show only our safe messages.
  return error instanceof SnapshotStorageError ? error.message : fallback;
}
