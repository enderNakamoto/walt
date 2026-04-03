import type { Metadata } from "next";
import { JetBrains_Mono, DM_Sans } from "next/font/google";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.remove('dark')}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <header className="relative border-b border-border/50">
          <div className="flex h-14 items-center justify-between px-6">
            <Link
              href="/"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary"></span>
                </span>
                <span className="font-mono text-lg font-bold tracking-tight">
                  WALT
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                Wallet-Aware LLM Tester
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <span className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
                v2
              </span>
            </div>
          </div>
          {/* Gradient bottom border */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        </header>
        {children}
      </body>
    </html>
  );
}
