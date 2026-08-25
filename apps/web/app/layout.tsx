import type { Metadata } from "next";
import "./globals.css";
import "./boho-theme.css";

export const metadata: Metadata = {
  title: "دیدبان زر و سیم | هوش ثروت و بازار",
  description: "سامانهٔ خصوصی و ایران‌محور برای مشاهدهٔ بازار، ثبت دارایی، تحلیل سناریو و کنترل کیفیت داده",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
