import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "API Intelligence",
  description: "Detect breaking API changes before they reach production.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
