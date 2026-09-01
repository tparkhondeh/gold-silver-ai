export type NavasanHistoryLockView = {
  state: "loading" | "locked" | "warning";
  message: string;
};

export function parseNavasanHistoryLockHealth(payload: unknown): NavasanHistoryLockView {
  if (!payload || typeof payload !== "object") {
    return { state: "warning", message: "پاسخ پایش قفل تاریخچه معتبر نیست؛ اجرای واقعی متوقف می‌ماند." };
  }

  const engines = (payload as { engines?: unknown }).engines;
  if (!Array.isArray(engines)) {
    return { state: "warning", message: "وضعیت قفل تاریخچه در دسترس نیست؛ اجرای واقعی متوقف می‌ماند." };
  }

  const engine = engines.find((item) => item
    && typeof item === "object"
    && (item as { id?: unknown }).id === "navasan-history") as { state?: unknown; reason?: unknown } | undefined;
  const reason = typeof engine?.reason === "string" && engine.reason.trim()
    ? engine.reason
    : "پایش قفل تاریخچه توضیح معتبری برنگرداند؛ اجرای واقعی متوقف می‌ماند.";

  if (engine?.state === "locked") return { state: "locked", message: reason };

  return {
    state: "warning",
    message: engine?.state === "authorized"
      ? "تنظیم غیرمنتظره شناسایی شد: مجوز اجرای تاریخچه باز است. رابط کاربری همچنان اجرا را متوقف نگه می‌دارد."
      : reason,
  };
}
