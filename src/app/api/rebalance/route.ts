import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPositions } from "@/lib/alpaca";
import { fetchQuotesForExchange, type QuoteRow } from "@/lib/market-quotes";
import { computeAttractiveness } from "@/lib/attractiveness";
import {
  planRebalance,
  type PortfolioPosition,
  type UniverseStock,
  type RebalanceConfig,
  type RebalancePlan,
} from "@/lib/rebalance";

export const dynamic = "force-dynamic";

const DEFAULT_CONFIG: RebalanceConfig = {
  threshold: 1.0,
  minBuyScore: 1,
  maxIterations: 5,
  minTradeUsd: 50,
};

const ALPACA_ENDPOINT = process.env.ALPACA_ENDPOINT ?? "https://paper-api.alpaca.markets/v2";

function alpacaHeaders(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET ?? "",
    "Content-Type": "application/json",
  };
}

type Constituent = {
  symbol: string;
  name: string;
  exchange: string;
  exchange_type: string;
};

type AnalystRow = { symbol: string; upside_pct: number | null };
type PoliticianRow = {
  symbol: string;
  buy_count: number | null;
  sell_count: number | null;
  news_sentiment: number | null;
  trends_direction: string | null;
};
type RatingRow   = { symbol: string; consensus_score: number | null };
type TechRow     = { symbol: string; signal: string | null };
type ShortRow    = { symbol: string; short_pct_float: number | null };
type InsiderRow  = { symbol: string; signal: string | null };
type EarningsRow = { symbol: string; beat_rate: number | null };

interface PlanBundle {
  plan: RebalancePlan;
  config: RebalanceConfig;
  summary: {
    heldStocks: number;
    universeSize: number;
    symbolsScored: number;
  };
}

async function buildPlan(config: RebalanceConfig): Promise<PlanBundle> {
  const db = createClient();

  const [positions, constituentsRes, analystRes, politicianRes, ratingsRes, techRes, shortRes, insiderRes, earningsRes] =
    await Promise.all([
      getPositions(),
      db.from("index_constituents").select("symbol, name, exchange, exchange_type").eq("active", true),
      db.from("analyst_cache").select("symbol, upside_pct"),
      db.from("politician_trade_summary").select("symbol, buy_count, sell_count, news_sentiment, trends_direction"),
      db.from("analyst_ratings").select("symbol, consensus_score"),
      db.from("technical_signals").select("symbol, signal"),
      db.from("short_interest_cache").select("symbol, short_pct_float"),
      db.from("insider_signals").select("symbol, signal"),
      db.from("earnings_signals").select("symbol, beat_rate"),
    ]);

  // Universe restricted to US-tradable (Alpaca paper); group by exchange for quote fetch
  const constituents = (constituentsRes.data ?? []) as Constituent[];
  const usExchanges = new Map<string, { symbol: string; name: string }[]>();
  for (const c of constituents) {
    if (c.exchange_type !== "us") continue;
    if (!usExchanges.has(c.exchange)) usExchanges.set(c.exchange, []);
    usExchanges.get(c.exchange)!.push({ symbol: c.symbol, name: c.name });
  }

  const quoteResults = await Promise.all(
    Array.from(usExchanges.values()).map((stocks) => fetchQuotesForExchange(stocks, "us"))
  );
  const quotes: QuoteRow[] = quoteResults.flat();

  const analystMap    = new Map((analystRes.data ?? []).map((r: AnalystRow) => [r.symbol, r]));
  const politicianMap = new Map((politicianRes.data ?? []).map((r: PoliticianRow) => [r.symbol, r]));
  const ratingsMap    = new Map((ratingsRes.data ?? []).map((r: RatingRow) => [r.symbol, r.consensus_score]));
  const techMap       = new Map((techRes.data ?? []).map((r: TechRow) => [r.symbol, r.signal]));
  const shortMap      = new Map((shortRes.data ?? []).map((r: ShortRow) => [r.symbol, r.short_pct_float]));
  const insiderMap    = new Map((insiderRes.data ?? []).map((r: InsiderRow) => [r.symbol, r.signal]));
  const earningsMap   = new Map((earningsRes.data ?? []).map((r: EarningsRow) => [r.symbol, r.beat_rate]));
  const quoteMap      = new Map(quotes.map((q) => [q.symbol, q]));

  // Score every symbol we know about (held + universe)
  const allSymbols = new Set<string>();
  for (const p of positions) allSymbols.add(p.symbol);
  for (const q of quotes) allSymbols.add(q.symbol);

  const scoreMap = new Map<string, number>();
  for (const sym of allSymbols) {
    const a = analystMap.get(sym);
    const p = politicianMap.get(sym);
    const q = quoteMap.get(sym);
    const r = computeAttractiveness({
      upside_pct: a?.upside_pct ?? null,
      buy_count: p?.buy_count ?? 0,
      sell_count: p?.sell_count ?? 0,
      news_sentiment: p?.news_sentiment ?? null,
      trends_direction: p?.trends_direction ?? null,
      changePct: q?.changePct ?? null,
      consensus_score: ratingsMap.get(sym) ?? null,
      tech_signal: techMap.get(sym) ?? null,
      short_pct_float: shortMap.get(sym) ?? null,
      insider_signal: insiderMap.get(sym) ?? null,
      eps_beat_rate: earningsMap.get(sym) ?? null,
    });
    scoreMap.set(sym, r.score);
  }

  // Held positions (US equities only — Alpaca paper limitation)
  const portfolioPositions: PortfolioPosition[] = positions
    .filter((p) => p.asset_class === "us_equity")
    .map((p) => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      price: parseFloat(p.current_price),
    }))
    .filter((p) => p.qty > 0 && p.price > 0);

  const positionScores = new Map<string, number>();
  for (const p of portfolioPositions) {
    positionScores.set(p.symbol, scoreMap.get(p.symbol) ?? 0);
  }

  // Universe = US quotes with a live price
  const universe: UniverseStock[] = quotes
    .filter((q) => q.price != null && q.price > 0 && !q.symbol.endsWith(".DE"))
    .map((q) => ({
      symbol: q.symbol,
      price: q.price as number,
      score: scoreMap.get(q.symbol) ?? 0,
    }));

  const plan = planRebalance(portfolioPositions, positionScores, universe, config);

  return {
    plan,
    config,
    summary: {
      heldStocks: portfolioPositions.length,
      universeSize: universe.length,
      symbolsScored: scoreMap.size,
    },
  };
}

function parseConfig(source: Record<string, string | undefined> | URLSearchParams): RebalanceConfig {
  const get = (k: string): string | null => {
    if (source instanceof URLSearchParams) return source.get(k);
    return source[k] ?? null;
  };
  return {
    threshold: numOr(get("threshold"), DEFAULT_CONFIG.threshold),
    minBuyScore: numOr(get("minBuyScore"), DEFAULT_CONFIG.minBuyScore),
    maxIterations: Math.max(1, Math.min(20, intOr(get("maxIterations"), DEFAULT_CONFIG.maxIterations))),
    minTradeUsd: numOr(get("minTradeUsd"), DEFAULT_CONFIG.minTradeUsd),
  };
}

function numOr(v: string | null, fallback: number): number {
  if (v == null) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function intOr(v: string | null, fallback: number): number {
  if (v == null) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const config = parseConfig(request.nextUrl.searchParams);
    const result = await buildPlan(config);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error building rebalance plan:", error);
    return NextResponse.json(
      { error: String(error), plan: null },
      { status: 500 }
    );
  }
}

interface ExecutedOrder {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  ok: boolean;
  error?: string;
}

interface CancelSummary {
  attempted: number;
  succeeded: number;
  failed: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, string>;
    const config = parseConfig(body);

    // Step 1: cancel any open orders so the position state used by the planner
    // matches reality (no half-filled or pending swaps from earlier runs).
    const canceled = await cancelAllOpenOrders();

    // Step 2: recompute the plan server-side — never trust a client-supplied list
    const { plan, summary } = await buildPlan(config);

    if (plan.swaps.length === 0) {
      return NextResponse.json({ canceled, executed: [], plan, summary });
    }

    const executed: ExecutedOrder[] = [];

    // Sells first; Alpaca paper auto-handles unsettled cash for the buys.
    for (const swap of plan.swaps) {
      executed.push(await placeOrder(swap.sell.symbol, swap.sell.qty, "sell"));
    }

    // Brief pause so sells register before buys hit
    await new Promise((r) => setTimeout(r, 1000));

    for (const swap of plan.swaps) {
      executed.push(await placeOrder(swap.buy.symbol, swap.buy.qty, "buy"));
    }

    return NextResponse.json({ canceled, executed, plan, summary });
  } catch (error) {
    console.error("Error executing rebalance:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

async function cancelAllOpenOrders(): Promise<CancelSummary> {
  try {
    const res = await fetch(`${ALPACA_ENDPOINT}/orders`, {
      method: "DELETE",
      headers: alpacaHeaders(),
    });
    if (!res.ok) {
      return { attempted: 0, succeeded: 0, failed: 0 };
    }
    const data = await res.json();
    if (!Array.isArray(data)) return { attempted: 0, succeeded: 0, failed: 0 };

    let succeeded = 0;
    let failed = 0;
    for (const item of data) {
      const status = typeof item?.status === "number" ? item.status : 500;
      if (status >= 200 && status < 300) succeeded++;
      else failed++;
    }
    return { attempted: data.length, succeeded, failed };
  } catch {
    return { attempted: 0, succeeded: 0, failed: 0 };
  }
}

async function placeOrder(
  symbol: string,
  qty: number,
  side: "buy" | "sell"
): Promise<ExecutedOrder> {
  try {
    const res = await fetch(`${ALPACA_ENDPOINT}/orders`, {
      method: "POST",
      headers: alpacaHeaders(),
      body: JSON.stringify({
        symbol,
        qty: String(qty),
        side,
        type: "market",
        time_in_force: "day",
      }),
    });
    if (!res.ok) {
      const error = await res.text();
      return { symbol, side, qty, ok: false, error };
    }
    return { symbol, side, qty, ok: true };
  } catch (e) {
    return { symbol, side, qty, ok: false, error: String(e) };
  }
}
