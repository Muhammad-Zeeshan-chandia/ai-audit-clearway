import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clearway AI",
  description: "AI Business Audit Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Vercel Analytics — only active in production on Vercel */}
        <Analytics />
      </body>
    </html>
  );
}
