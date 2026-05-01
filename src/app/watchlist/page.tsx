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

  // Fetch all signals + historical bar changes + macro context in parallel
  const signalsBySymbol: Record<string, SymbolSignals> = {};
  let historicalChanges: Record<string, HistoricalChanges> = {};
  if (ownedSymbols.length > 0) {
    const [
      barChanges, analystRes, politicianRes, ratingsRes, techRes, 
      shortRes, insiderRes, earningsRes, socialRes, optionsRes, 
      revisionsRes, rsRes, instRes, breadthRes, vixRes, 
      fhAdvisoryRes, fhSRRes, fhMetricsRes, ecoRes
    ] = await Promise.all([
        getMultiBarChanges(ownedSymbols),
        db.from("analyst_cache").select("symbol, upside_pct").in("symbol", ownedSymbols),
        db.from("politician_trade_summary").select("symbol, buy_count, sell_count, news_sentiment, trends_direction").in("symbol", ownedSymbols),
        db.from("analyst_ratings").select("symbol, consensus_score").in("symbol", ownedSymbols),
        db.from("technical_signals").select("symbol, signal").in("symbol", ownedSymbols),
        db.from("short_interest_cache").select("symbol, short_pct_float").in("symbol", ownedSymbols),
        db.from("insider_signals").select("symbol, signal").in("symbol", ownedSymbols),
        db.from("earnings_signals").select("symbol, beat_rate").in("symbol", ownedSymbols),
        db.from("social_sentiment").select("symbol, wsb_sentiment").in("symbol", ownedSymbols),
        db.from("options_flow").select("symbol, call_put_skew, unusual_contracts").in("symbol", ownedSymbols),
        db.from("analyst_revisions").select("symbol, rev_ratio").in("symbol", ownedSymbols),
        db.from("relative_strength").select("symbol, rs_3m").in("symbol", ownedSymbols),
        db.from("institutional_conviction").select("symbol, pct_held_institutions").in("symbol", ownedSymbols),
        db.from("market_breadth").select("*"),
        db.from("market_volatility").select("*").eq("indicator", "VIX").single(),
        db.from("finnhub_technical_advisory").select("symbol, advisory").in("symbol", ownedSymbols),
        db.from("finnhub_support_resistance").select("symbol, levels").in("symbol", ownedSymbols),
        db.from("finnhub_metrics").select("symbol, pe_ttm, low_52w").in("symbol", ownedSymbols),
        db.from("economic_indicators").select("indicator, value"),
      ]);
    historicalChanges = barChanges;

    // Extract macro indicators (global, same for all symbols)
    const fedRate = (ecoRes.data as any[])?.find(r => r.indicator === "DFF")?.value ?? null;
    const unemployment = (ecoRes.data as any[])?.find(r => r.indicator === "UNRATE")?.value ?? null;
    const vix = (vixRes.data as any)?.value ?? null;
    const breadthMap: Record<string, number> = {};
    for (const b of (breadthRes.data as any[] ?? [])) breadthMap[b.exchange] = b.pct_above_sma50;

    for (const sym of ownedSymbols) {
      const tickPrice = latestPrices[sym];
      const h = holdings.find(x => x.symbol === sym);
      const fallbackPrice = h?.position ? parseFloat(h.position.current_price) : undefined;
      const currentPrice = tickPrice ?? fallbackPrice ?? null;
      
      signalsBySymbol[sym] = { 
        changePct: changes[sym] ?? null,
        current_price: currentPrice
      };
    }

    for (const row of analystRes.data ?? [])    signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], upside_pct: row.upside_pct };
    for (const row of politicianRes.data ?? []) signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], buy_count: row.buy_count, sell_count: row.sell_count, news_sentiment: row.news_sentiment, trends_direction: row.trends_direction };
    for (const row of ratingsRes.data ?? [])    signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], consensus_score: row.consensus_score };
    for (const row of techRes.data ?? [])       signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], tech_signal: row.signal };
    for (const row of shortRes.data ?? [])      signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], short_pct_float: row.short_pct_float };
    for (const row of insiderRes.data ?? [])    signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], insider_signal: row.signal };
    for (const row of earningsRes.data ?? [])   signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], eps_beat_rate: row.beat_rate };
    for (const row of socialRes.data ?? [])     signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], wsb_sentiment: row.wsb_sentiment };
    for (const row of optionsRes.data ?? [])    signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], options_skew: row.call_put_skew, options_unusual_count: row.unusual_contracts };
    for (const row of revisionsRes.data ?? [])  signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], rev_ratio: row.rev_ratio };
    for (const row of rsRes.data ?? [])         signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], rs_3m: row.rs_3m };
    for (const row of instRes.data ?? [])       signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], inst_pct: row.pct_held_institutions };
    for (const row of fhAdvisoryRes.data ?? []) signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], fh_advisory: row.advisory };
    for (const row of fhSRRes.data ?? [])       signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], fh_levels: row.levels };
    for (const row of fhMetricsRes.data ?? [])  signalsBySymbol[row.symbol] = { ...signalsBySymbol[row.symbol], fh_pe: row.pe_ttm, fh_52w_low: row.low_52w };

    // Inject macro context (same for all symbols or exchange-specific)
    for (const sym of ownedSymbols) {
      const h = holdings.find(h => h.symbol === sym);
      const exchange = h?.watch?.symbol ? (h.symbol.endsWith(".DE") ? "DAX" : "Nasdaq 100") : "Nasdaq 100"; // Simple fallback
      signalsBySymbol[sym] = { 
        ...signalsBySymbol[sym], 
        fed_rate: fedRate, 
        unemployment,
        vix,
        breadth_50: breadthMap[exchange] ?? null
      };
    }
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
