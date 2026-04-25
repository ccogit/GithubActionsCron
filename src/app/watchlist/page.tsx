import { createClient } from "@/lib/supabase/server";
import { getPositions } from "@/lib/alpaca";
import { RealtimeWatchlist } from "@/components/RealtimeWatchlist";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { AddStockForms } from "@/components/AddStockForms";
import { MarketTabs } from "@/components/MarketTabs";
import type { WatchlistRow, PriceTick, AlertLogRow } from "@/lib/types";
import type { Holding } from "@/components/StocksTable";

export const dynamic = "force-dynamic";

const CHART_COLORS = ["#00c896", "#3b82f6", "#f59e0b", "#e879f9", "#34d399", "#fb923c"];

export default async function StocksPage() {
  const db = createClient();

  const [watchlistRes, ticksRes, alertsRes, positions] = await Promise.all([
    db.from("watchlist").select("*").order("created_at"),
    db
      .from("price_ticks")
      .select("*")
      .gte("fetched_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order("fetched_at"),
    db.from("alert_log").select("*").order("sent_at", { ascending: false }).limit(20),
    getPositions(),
  ]);

  const watchlist: WatchlistRow[] = watchlistRes.data ?? [];
  const ticks: PriceTick[] = ticksRes.data ?? [];
  const alerts: AlertLogRow[] = alertsRes.data ?? [];

  const holdingsMap = new Map<string, Holding>();
  for (const w of watchlist) {
    holdingsMap.set(w.symbol, { symbol: w.symbol, watch: w, position: null });
  }
  for (const p of positions) {
    const existing = holdingsMap.get(p.symbol);
    if (existing) existing.position = p;
    else holdingsMap.set(p.symbol, { symbol: p.symbol, watch: null, position: p });
  }
  const holdings = Array.from(holdingsMap.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );

  const ticksBySymbol: Record<string, PriceTick[]> = {};
  for (const tick of ticks) {
    (ticksBySymbol[tick.symbol] ??= []).push(tick);
  }

  const latestPrices: Record<string, number> = {};
  for (const tick of ticks) {
    latestPrices[tick.symbol] = tick.price;
  }

  const changes: Record<string, number | null> = {};
  for (const h of holdings) {
    const symTicks = ticksBySymbol[h.symbol];
    if (!symTicks?.length) { changes[h.symbol] = null; continue; }
    const first = symTicks[0].price;
    const last = symTicks[symTicks.length - 1].price;
    changes[h.symbol] = ((last - first) / first) * 100;
  }

  // Calculate alert counts per symbol
  const alertCountsBySymbol: Record<string, number> = {};
  for (const alert of alerts) {
    alertCountsBySymbol[alert.symbol] = (alertCountsBySymbol[alert.symbol] || 0) + 1;
  }

  const ownedSymbols = holdings.map((h) => h.symbol);

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* MY PORTFOLIO */}
        <CollapsibleSection
          title="My Portfolio"
          defaultOpen={true}
          headerActions={<AddStockForms />}
        >
          <RealtimeWatchlist
            holdings={holdings}
            initialLatestPrices={latestPrices}
            initialChanges={changes}
            initialTicksBySymbol={ticksBySymbol}
            colors={CHART_COLORS}
          />
        </CollapsibleSection>

        {/* MARKET — flat tab nav: Analysts | Investors | Politicians | Spotlight | Alerts | Explore */}
        <MarketTabs
          alerts={alerts}
          ownedSymbols={ownedSymbols}
          alertCountsBySymbol={alertCountsBySymbol}
        />
      </main>
    </div>
  );
}
