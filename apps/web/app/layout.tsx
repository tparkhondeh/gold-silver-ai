import type { Metadata } from "next";
import "./globals.css";
import "./boho-theme.css";

export const metadata: Metadata = {
  title: "اشا | دستیار تصمیم زر و سیم",
  description: "اشا؛ دستیار خصوصی و ایران‌محور برای مشاهدهٔ سبد، بازار، سناریو و کیفیت داده",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
