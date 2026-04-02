"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, MessageSquare, Play, LayoutDashboard } from "lucide-react";

const tabs = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/explore", label: "Explore", icon: Search },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/runs", label: "Runs", icon: Play },
];

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav className="mt-2 flex gap-1">
      {tabs.map((tab) => {
        const href = `${base}${tab.href}`;
        const isActive =
          tab.href === ""
            ? pathname === base
            : pathname.startsWith(href);

        return (
          <Link
            key={tab.href}
            href={href}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
