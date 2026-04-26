import { createClient } from "@/lib/supabase/server";
import { getPositions, getMultiBarChanges, type HistoricalChanges } from "@/lib/alpaca";
import { RealtimeWatchlist } from "@/components/RealtimeWatchlist";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { AddStockForms } from "@/components/AddStockForms";
import { MarketTabs } from "@/components/MarketTabs";
import { DashboardControls } from "@/components/DashboardControls";
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

  // Fetch all signals + historical bar changes in parallel
  const signalsBySymbol: Record<string, SymbolSignals> = {};
  let historicalChanges: Record<string, HistoricalChanges> = {};
  if (ownedSymbols.length > 0) {
    const [barChanges, analystRes, politicianRes, ratingsRes, techRes, shortRes, insiderRes, earningsRes, socialRes] =
      await Promise.all([
        getMultiBarChanges(ownedSymbols),
        db.from("analyst_cache").select("symbol, upside_pct").in("symbol", ownedSymbols),
        db.from("politician_trade_summary").select("symbol, buy_count, sell_count, news_sentiment, trends_direction").in("symbol", ownedSymbols),
        db.from("analyst_ratings").select("symbol, consensus_score").in("symbol", ownedSymbols),
        db.from("technical_signals").select("symbol, signal").in("symbol", ownedSymbols),
        db.from("short_interest_cache").select("symbol, short_pct_float").in("symbol", ownedSymbols),
        db.from("insider_signals").select("symbol, signal").in("symbol", ownedSymbols),
        db.from("earnings_signals").select("symbol, beat_rate").in("symbol", ownedSymbols),
        db.from("social_sentiment").select("symbol, wsb_sentiment").in("symbol", ownedSymbols),
      ]);
    historicalChanges = barChanges;

    for (const sym of ownedSymbols) signalsBySymbol[sym] = { changePct: changes[sym] ?? null };

    for (const row of analystRes.data ?? [])    signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], upside_pct: row.upside_pct };
    for (const row of politicianRes.data ?? []) signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], buy_count: row.buy_count, sell_count: row.sell_count, news_sentiment: row.news_sentiment, trends_direction: row.trends_direction };
    for (const row of ratingsRes.data ?? [])    signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], consensus_score: row.consensus_score };
    for (const row of techRes.data ?? [])       signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], tech_signal: row.signal };
    for (const row of shortRes.data ?? [])      signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], short_pct_float: row.short_pct_float };
    for (const row of insiderRes.data ?? [])    signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], insider_signal: row.signal };
    for (const row of earningsRes.data ?? [])   signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], eps_beat_rate: row.beat_rate };
    for (const row of socialRes.data ?? [])     signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], wsb_sentiment: row.wsb_sentiment };
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Action strip: signal refresh left, rebalance toggle + panel right */}
        <DashboardControls />

        {/* MY PORTFOLIO */}
        <CollapsibleSection
          title="My Portfolio"
          defaultOpen={true}
          headerActions={<AddStockForms />}
        >
          <RealtimeWatchlist
            holdings={holdings}
            initialLatestPrices={latestPrices}
            initialTicksBySymbol={ticksBySymbol}
            historicalChanges={historicalChanges}
            colors={CHART_COLORS}
            signals={signalsBySymbol}
          />
        </CollapsibleSection>

        {/* MARKET — flat tab nav: Spotlight | Analysts | Investors | Politicians | Alerts | Explore */}
        <MarketTabs alerts={alerts} />
      </main>
    </div>
  );
}
