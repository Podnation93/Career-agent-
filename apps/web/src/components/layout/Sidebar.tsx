"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: "▢" },
  { href: "/jobs", label: "Jobs", icon: "≣" },
  { href: "/tracker", label: "Tracker", icon: "▥" },
  { href: "/import", label: "Import", icon: "↧" },
  { href: "/documents", label: "Documents", icon: "▤" },
  { href: "/profile", label: "Profile", icon: "◍" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:block">
      <div className="mb-6 px-2">
        <span className="text-lg font-bold text-brand-600">Job</span>
        <span className="text-lg font-bold">Pilot</span>
        <p className="mt-0.5 text-[11px] text-slate-400">application copilot</p>
      </div>
      <nav className="space-y-1">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              <span className="w-4 text-center text-slate-400">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
