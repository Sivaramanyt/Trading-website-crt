import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRT Terminal — Crypto Range Trading",
  description: "Binance crypto chart and foundational CRT analysis terminal.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
