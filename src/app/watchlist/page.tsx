import { createClient } from "@/lib/supabase/server";
import { WatchlistTable } from "@/components/WatchlistTable";
import { AddSymbolForm } from "@/components/AddSymbolForm";
import { AlertsTable } from "@/components/AlertsTable";
import { PriceChart } from "@/components/PriceChart";
import { AutoRefresh } from "@/components/AutoRefresh";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { WatchlistRow, PriceTick, AlertLogRow } from "@/lib/types";

export const revalidate = 60;

const CHART_COLORS = ["#00c896", "#3b82f6", "#f59e0b", "#e879f9", "#34d399", "#fb923c"];

export default async function WatchlistPage() {
  const db = await createClient();

  const [watchlistRes, ticksRes, alertsRes] = await Promise.all([
    db.from("watchlist").select("*").order("created_at"),
    db
      .from("price_ticks")
      .select("*")
      .gte("fetched_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order("fetched_at"),
    db.from("alert_log").select("*").order("sent_at", { ascending: false }).limit(20),
  ]);

  const watchlist: WatchlistRow[] = watchlistRes.data ?? [];
  const ticks: PriceTick[] = ticksRes.data ?? [];
  const alerts: AlertLogRow[] = alertsRes.data ?? [];

  const ticksBySymbol: Record<string, PriceTick[]> = {};
  for (const tick of ticks) {
    (ticksBySymbol[tick.symbol] ??= []).push(tick);
  }

  const latestPrices: Record<string, number> = {};
  for (const tick of ticks) {
    latestPrices[tick.symbol] = tick.price;
  }

  const changes: Record<string, number | null> = {};
  for (const { symbol } of watchlist) {
    const symTicks = ticksBySymbol[symbol];
    if (!symTicks?.length) { changes[symbol] = null; continue; }
    const first = symTicks[0].price;
    const last = symTicks[symTicks.length - 1].price;
    changes[symbol] = ((last - first) / first) * 100;
  }

  return (
    <div className="min-h-screen">
      <AutoRefresh intervalMs={60_000} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Watchlist
            </h2>
            <AddSymbolForm />
          </div>
          <div className="rounded-lg border border-white/8 bg-card overflow-hidden">
            <WatchlistTable
              watchlist={watchlist}
              latestPrices={latestPrices}
              changes={changes}
              colors={CHART_COLORS}
            />
          </div>
        </section>

        {watchlist.length > 0 && (
          <section>
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
              Price History · 2h
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {watchlist.map((row, i) => {
                const color = CHART_COLORS[i % CHART_COLORS.length];
                const change = changes[row.symbol];
                const currentPrice = latestPrices[row.symbol];
                return (
                  <div
                    key={row.symbol}
                    className="rounded-lg border border-white/8 bg-card p-5 overflow-hidden"
                    style={{ borderTopColor: color, borderTopWidth: "2px" }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="font-mono font-bold text-sm tracking-widest" style={{ color }}>
                          {row.symbol}
                        </div>
                        <div className="font-mono font-semibold text-2xl text-foreground mt-0.5 tabular-nums">
                          {currentPrice !== undefined ? `$${currentPrice.toFixed(2)}` : "—"}
                        </div>
                      </div>
                      {change !== null ? (
                        <div className={`flex flex-col items-end ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          <span className="flex items-center gap-1 font-mono text-sm font-semibold tabular-nums">
                            {change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">2h change</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground font-mono">No data</span>
                      )}
                    </div>
                    <PriceChart ticks={ticksBySymbol[row.symbol] ?? []} symbol={row.symbol} color={color} />
                    {row.min_price > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                        <span>Alert threshold:</span>
                        <span className={currentPrice !== undefined && currentPrice < row.min_price ? "text-red-400 font-medium" : "text-foreground"}>
                          ${row.min_price.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
            Recent Alerts
          </h2>
          <div className="rounded-lg border border-white/8 bg-card overflow-hidden">
            <AlertsTable alerts={alerts} />
          </div>
        </section>

      </main>
    </div>
  );
}
