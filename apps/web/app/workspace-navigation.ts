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

export const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "نمای کلی", icon: "⌂" },
  { id: "portfolio", label: "فهرست دارایی‌ها", icon: "◫" },
  { id: "asset-center", label: "مرکز دارایی", icon: "◎" },
  { id: "analysis", label: "تحلیل دارایی‌ها", icon: "◉" },
  { id: "decisions", label: "تصمیم‌های دارایی", icon: "◇" },
  { id: "market", label: "دیده‌بان بازار", icon: "⌁" },
  { id: "risk", label: "ریسک و تخصیص", icon: "△" },
  { id: "data", label: "کیفیت داده", icon: "▤" },
  { id: "agents", label: "هیئت بررسی", icon: "✓" },
];

export const assetJourney: View[] = ["portfolio", "asset-center", "analysis", "decisions"];
