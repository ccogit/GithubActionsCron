"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/watchlist", label: "Stocks" },
  { href: "/orders", label: "Orders" },
];

export function Nav({ email }: { email?: string }) {
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
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </span>
          {email && (
            <span className="hidden sm:block text-xs font-mono text-muted-foreground/60 truncate max-w-[160px]">
              {email}
            </span>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
