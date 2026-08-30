export type View =
  | "overview"
  | "portfolio"
  | "asset-center"
  | "analysis"
  | "decisions"
  | "market"
  | "risk"
  | "data"
  | "agents";

export const navItems: Array<{ id: View; label: string }> = [
  { id: "overview", label: "نمای کلی" },
  { id: "portfolio", label: "فهرست دارایی‌ها" },
  { id: "asset-center", label: "مرکز دارایی" },
  { id: "analysis", label: "تحلیل دارایی‌ها" },
  { id: "decisions", label: "تصمیم‌های دارایی" },
  { id: "market", label: "دیده‌بان بازار" },
  { id: "risk", label: "ریسک و تخصیص" },
  { id: "data", label: "کیفیت داده" },
  { id: "agents", label: "هیئت بررسی" },
];

export const assetJourney: View[] = ["portfolio", "asset-center", "analysis", "decisions"];
