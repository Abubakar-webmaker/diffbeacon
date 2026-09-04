import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DiffBeacon — Detect breaking API changes before production",
  description: "Deterministic diff first. AI explains impact second.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
