import { createClient } from "@/lib/supabase/server";
import { getPositions } from "@/lib/alpaca";
import { RealtimeWatchlist } from "@/components/RealtimeWatchlist";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { AddStockForms } from "@/components/AddStockForms";
import { MarketTabs } from "@/components/MarketTabs";
import { RebalanceView } from "@/components/RebalanceView";
import { RefreshSignalsButton } from "@/components/RefreshSignalsButton";
import type { WatchlistRow, PriceTick, AlertLogRow } from "@/lib/types";
import type { Holding, SymbolSignals } from "@/components/StocksTable";

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

  // Fetch personalized signals for owned symbols (analyst upside + politician/sentiment data)
  const signalsBySymbol: Record<string, SymbolSignals> = {};
  if (ownedSymbols.length > 0) {
    const [analystSignalsRes, politicianSignalsRes] = await Promise.all([
      db
        .from("analyst_cache")
        .select("symbol, upside_pct")
        .in("symbol", ownedSymbols),
      db
        .from("politician_trade_summary")
        .select("symbol, buy_count, sell_count, news_sentiment, trends_direction")
        .in("symbol", ownedSymbols),
    ]);

    for (const sym of ownedSymbols) signalsBySymbol[sym] = {};
    for (const row of analystSignalsRes.data ?? []) {
      signalsBySymbol[row.symbol] = {
        ...signalsBySymbol[row.symbol],
        upside_pct: row.upside_pct,
      };
    }
    for (const row of politicianSignalsRes.data ?? []) {
      signalsBySymbol[row.symbol] = {
        ...signalsBySymbol[row.symbol],
        buy_count: row.buy_count ?? 0,
        sell_count: row.sell_count ?? 0,
        news_sentiment: row.news_sentiment,
        trends_direction: row.trends_direction,
      };
    }
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <RefreshSignalsButton />

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
            signals={signalsBySymbol}
          />
        </CollapsibleSection>

        {/* DAILY REBALANCE — collapsed by default; preview-then-execute flow */}
        <CollapsibleSection title="Daily Rebalance" defaultOpen={false}>
          <RebalanceView />
        </CollapsibleSection>

        {/* MARKET — flat tab nav: Spotlight | Analysts | Investors | Politicians | Alerts | Explore */}
        <MarketTabs alerts={alerts} />
      </main>
    </div>
  );
}
