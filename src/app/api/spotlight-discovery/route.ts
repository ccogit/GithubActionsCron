import { createClient } from "@/lib/supabase/server";
import { fetchQuotesForExchange, type QuoteRow } from "@/lib/market-quotes";
import { computeAttractiveness } from "@/lib/attractiveness";

export const revalidate = 300;

const EXCHANGES = ["Dow Jones", "Nasdaq 100", "DAX"] as const;
type Exchange = (typeof EXCHANGES)[number];

const EXCHANGE_TYPE: Record<Exchange, "us" | "de"> = {
  "Dow Jones": "us",
  "Nasdaq 100": "us",
  DAX: "de",
};

interface DiscoveryStock {
  symbol: string;
  exchange: string | null;
  name: string | null;

  upside_pct: number | null;
  current_price: number | null;
  target_mean: number | null;
  n_analysts: number | null;

  changePct: number | null;

  buy_count: number;
  sell_count: number;
  news_sentiment: number | null;
  trends_direction: string | null;

  // new signals
  consensus_score: number | null;
  tech_signal: string | null;
  short_pct_float: number | null;
  insider_signal: string | null;
  eps_beat_rate: number | null;
  wsb_sentiment: string | null;

  score: number;
  signalCount: number;
  outlook: "bullish" | "bearish" | "mixed";
  reasons: string[];
}

type Constituent = { symbol: string; name: string; exchange: string; exchange_type: string };
type AnalystRow = { symbol: string; target_mean: number | null; current_price: number | null; upside_pct: number | null; n_analysts: number | null };
type PoliticianRow = { symbol: string; buy_count: number | null; sell_count: number | null; news_sentiment: number | null; trends_direction: string | null };
type RatingRow = { symbol: string; consensus_score: number | null };
type TechRow = { symbol: string; signal: string | null };
type ShortRow = { symbol: string; short_pct_float: number | null };
type InsiderRow = { symbol: string; signal: string | null };
type EarningsRow = { symbol: string; beat_rate: number | null };
type SocialRow = { symbol: string; wsb_sentiment: string | null };

function computeScore(stock: DiscoveryStock): void {
  const r = computeAttractiveness({
    upside_pct: stock.upside_pct,
    buy_count: stock.buy_count,
    sell_count: stock.sell_count,
    news_sentiment: stock.news_sentiment,
    trends_direction: stock.trends_direction,
    changePct: stock.changePct,
    consensus_score: stock.consensus_score,
    tech_signal: stock.tech_signal,
    short_pct_float: stock.short_pct_float,
    insider_signal: stock.insider_signal,
    eps_beat_rate: stock.eps_beat_rate,
    wsb_sentiment: stock.wsb_sentiment,
  });
  stock.score = r.score;
  stock.signalCount = r.signalCount;
  stock.outlook = r.outlook;
  stock.reasons = r.reasons;
}

export async function GET() {
  try {
    const db = createClient();

    const [constituentsRes, analystRes, politicianRes, ratingsRes, techRes, shortRes, insiderRes, earningsRes, socialRes] =
      await Promise.all([
        db.from("index_constituents").select("symbol, name, exchange, exchange_type").eq("active", true),
        db.from("analyst_cache").select("symbol, target_mean, current_price, upside_pct, n_analysts").not("upside_pct", "is", null),
        db.from("politician_trade_summary").select("symbol, buy_count, sell_count, news_sentiment, trends_direction"),
        db.from("analyst_ratings").select("symbol, consensus_score"),
        db.from("technical_signals").select("symbol, signal"),
        db.from("short_interest_cache").select("symbol, short_pct_float"),
        db.from("insider_signals").select("symbol, signal"),
        db.from("earnings_signals").select("symbol, beat_rate"),
        db.from("social_sentiment").select("symbol, wsb_sentiment"),
      ]);

    const allConstituents = (constituentsRes.data ?? []) as Constituent[];
    const byExchange = new Map<Exchange, Constituent[]>();
    for (const c of allConstituents) {
      if (!byExchange.has(c.exchange as Exchange)) byExchange.set(c.exchange as Exchange, []);
      byExchange.get(c.exchange as Exchange)!.push(c);
    }

    const quoteResults = await Promise.all(
      EXCHANGES.map((ex) =>
        fetchQuotesForExchange(byExchange.get(ex) ?? [], EXCHANGE_TYPE[ex]).then(
          (quotes) => [ex, quotes] as const
        )
      )
    );

    const quoteMap = new Map<string, { quote: QuoteRow; exchange: Exchange }>();
    for (const [exchange, quotes] of quoteResults) {
      for (const q of quotes) quoteMap.set(q.symbol, { quote: q, exchange });
    }

    const ratingsMap = new Map((ratingsRes.data ?? []).map((r: RatingRow) => [r.symbol, r.consensus_score]));
    const techMap = new Map((techRes.data ?? []).map((r: TechRow) => [r.symbol, r.signal]));
    const shortMap = new Map((shortRes.data ?? []).map((r: ShortRow) => [r.symbol, r.short_pct_float]));
    const insiderMap = new Map((insiderRes.data ?? []).map((r: InsiderRow) => [r.symbol, r.signal]));
    const earningsMap = new Map((earningsRes.data ?? []).map((r: EarningsRow) => [r.symbol, r.beat_rate]));
    const socialMap = new Map((socialRes.data ?? []).map((r: SocialRow) => [r.symbol, r.wsb_sentiment]));

    const stockMap = new Map<string, DiscoveryStock>();

    const ensure = (symbol: string): DiscoveryStock => {
      let s = stockMap.get(symbol);
      if (!s) {
        const meta = quoteMap.get(symbol);
        s = {
          symbol,
          exchange: meta?.exchange ?? null,
          name: meta?.quote.name ?? null,
          upside_pct: null,
          current_price: null,
          target_mean: null,
          n_analysts: null,
          changePct: meta?.quote.changePct ?? null,
          buy_count: 0,
          sell_count: 0,
          news_sentiment: null,
          trends_direction: null,
          consensus_score: ratingsMap.get(symbol) ?? null,
          tech_signal: techMap.get(symbol) ?? null,
          short_pct_float: shortMap.get(symbol) ?? null,
          insider_signal: insiderMap.get(symbol) ?? null,
          eps_beat_rate: earningsMap.get(symbol) ?? null,
          wsb_sentiment: socialMap.get(symbol) ?? null,
          score: 0,
          signalCount: 0,
          outlook: "mixed",
          reasons: [],
        };
        stockMap.set(symbol, s);
      }
      return s;
    };

    for (const row of (analystRes.data ?? []) as AnalystRow[]) {
      const s = ensure(row.symbol);
      s.upside_pct = row.upside_pct;
      s.current_price = row.current_price;
      s.target_mean = row.target_mean;
      s.n_analysts = row.n_analysts;
    }

    for (const row of (politicianRes.data ?? []) as PoliticianRow[]) {
      const s = ensure(row.symbol);
      s.buy_count = row.buy_count ?? 0;
      s.sell_count = row.sell_count ?? 0;
      s.news_sentiment = row.news_sentiment;
      s.trends_direction = row.trends_direction;
    }

    for (const stock of stockMap.values()) computeScore(stock);

    const top = Array.from(stockMap.values())
      .filter((s) => s.signalCount >= 2 && Math.abs(s.score) >= 2)
      .sort((a, b) => {
        const aPower = Math.abs(a.score) * 10 + a.signalCount;
        const bPower = Math.abs(b.score) * 10 + b.signalCount;
        return bPower - aPower;
      })
      .slice(0, 20);

    return Response.json({ stocks: top });
  } catch (error) {
    console.error("Error in spotlight-discovery:", error);
    return Response.json({ stocks: [], error: String(error) }, { status: 200 });
  }
}
