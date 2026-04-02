import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { TestTube } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WALT — Wallet-Aware LLM Tester",
  description:
    "AI agent that explores Stellar dApps and generates Playwright tests",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="border-b">
          <div className="flex h-14 items-center px-6">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold hover:opacity-80"
            >
              <TestTube className="h-5 w-5" />
              WALT
            </Link>
            <span className="ml-2 text-sm text-muted-foreground">
              Wallet-Aware LLM Tester
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
