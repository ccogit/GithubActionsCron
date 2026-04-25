"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/orders", label: "Orders" },
];

export function Nav() {
  const path = usePathname();

  return (
    <nav className="border-b border-white/6 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <Link href="/" className="text-xs font-semibold tracking-[0.18em] uppercase text-foreground hover:text-primary transition-colors">
            Stock Watcher
          </Link>
          <div className="flex items-center gap-1">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  path === href
                    ? "bg-primary/15 text-primary border border-primary/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          LIVE
        </span>
      </div>
    </nav>
  );
}
