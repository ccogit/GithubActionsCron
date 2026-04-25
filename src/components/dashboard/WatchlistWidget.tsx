import Link from "next/link";
import { ArrowUpRight, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

const ACCENT = "#00c896";

export async function WatchlistWidget() {
  const db = await createClient();

  const [watchlistRes, ticksRes] = await Promise.all([
    db.from("watchlist").select("*").order("created_at"),
    db
      .from("price_ticks")
      .select("*")
      .gte("fetched_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order("fetched_at"),
  ]);

  const watchlist = watchlistRes.data ?? [];
  const ticks = ticksRes.data ?? [];

  const latestPrices: Record<string, number> = {};
  for (const tick of ticks) latestPrices[tick.symbol] = tick.price;

  const alertCount = watchlist.filter((row) => {
    const p = latestPrices[row.symbol];
    return p !== undefined && row.min_price > 0 && p < row.min_price;
  }).length;

  const preview = watchlist.slice(0, 4);

  return (
    <Link
      href="/watchlist"
      className="group block rounded-lg border border-white/8 bg-card hover:border-white/16 transition-colors p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5" style={{ color: ACCENT }} />
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Watchlist
          </span>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
      </div>

      {/* Key metric */}
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-mono font-semibold text-foreground">
          {watchlist.length}
        </span>
        <span className="text-sm text-muted-foreground">
          symbol{watchlist.length !== 1 ? "s" : ""}
        </span>
        {alertCount > 0 && (
          <span className="ml-auto text-xs font-mono font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">
            {alertCount} ALERT{alertCount !== 1 ? "S" : ""}
          </span>
        )}
      </div>

      {/* Preview rows */}
      <div className="space-y-2">
        {preview.map((row) => {
          const price = latestPrices[row.symbol];
          const below =
            price !== undefined && row.min_price > 0 && price < row.min_price;
          return (
            <div key={row.symbol} className="flex items-center justify-between">
              <span className="font-mono text-sm font-semibold" style={{ color: ACCENT }}>
                {row.symbol}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm tabular-nums text-foreground">
                  {price !== undefined ? `$${price.toFixed(2)}` : "—"}
                </span>
                {below ? (
                  <span className="text-xs font-mono text-red-400">BELOW</span>
                ) : price !== undefined ? (
                  <span className="text-xs font-mono text-emerald-400">OK</span>
                ) : null}
              </div>
            </div>
          );
        })}
        {watchlist.length === 0 && (
          <p className="text-xs text-muted-foreground font-mono">No symbols added yet</p>
        )}
        {watchlist.length > 4 && (
          <p className="text-xs text-muted-foreground font-mono pt-1">
            +{watchlist.length - 4} more
          </p>
        )}
      </div>
    </Link>
  );
}
