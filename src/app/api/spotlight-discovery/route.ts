import { createClient } from "@/lib/supabase/server";
import { fetchQuotesForExchange, type QuoteRow } from "@/lib/market-quotes";

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

  score: number;
  signalCount: number;
  outlook: "bullish" | "bearish" | "mixed";
  reasons: string[];
}

type AnalystRow = {
  symbol: string;
  target_mean: number | null;
  current_price: number | null;
  upside_pct: number | null;
  n_analysts: number | null;
};

type PoliticianRow = {
  symbol: string;
  buy_count: number | null;
  sell_count: number | null;
  news_sentiment: number | null;
  trends_direction: string | null;
};

type Constituent = { symbol: string; name: string; exchange: string; exchange_type: string };

function computeScore(stock: DiscoveryStock): void {
  let s = 0;
  let count = 0;
  const reasons: string[] = [];

  if (stock.upside_pct != null) {
    if (stock.upside_pct > 15) {
      s += 2; count++;
      reasons.push(`+${stock.upside_pct.toFixed(0)}% analyst upside`);
    } else if (stock.upside_pct > 5) {
      s += 1; count++;
    } else if (stock.upside_pct < -10) {
      s -= 2; count++;
      reasons.push(`${stock.upside_pct.toFixed(0)}% analyst downside`);
    } else if (stock.upside_pct < -3) {
      s -= 1; count++;
    }
  }

  const trades = stock.buy_count + stock.sell_count;
  if (trades >= 3) {
    const ratio = stock.buy_count / trades;
    if (ratio > 0.7) {
      s += 1; count++;
      reasons.push(`${stock.buy_count} politicians buying`);
    } else if (ratio < 0.3) {
      s -= 1; count++;
      reasons.push(`${stock.sell_count} politicians selling`);
    }
  }

  if (stock.news_sentiment != null) {
    if (stock.news_sentiment > 0.2) {
      s += 1; count++;
      reasons.push("positive news");
    } else if (stock.news_sentiment < -0.2) {
      s -= 1; count++;
      reasons.push("negative news");
    }
  }

  if (stock.trends_direction === "rising") {
    s += 1; count++;
    reasons.push("rising interest");
  } else if (stock.trends_direction === "falling") {
    s -= 1; count++;
  }

  if (stock.changePct != null) {
    if (stock.changePct > 5) {
      s += 1; count++;
      reasons.push(`+${stock.changePct.toFixed(1)}% today`);
    } else if (stock.changePct < -5) {
      s -= 1; count++;
      reasons.push(`${stock.changePct.toFixed(1)}% today`);
    }
  }

  stock.score = s;
  stock.signalCount = count;
  stock.outlook = s >= 2 ? "bullish" : s <= -2 ? "bearish" : "mixed";
  stock.reasons = reasons.slice(0, 3);
}

export async function GET() {
  try {
    const db = createClient();

    // Step 1: fetch constituents, analyst data, and politician signals in parallel
    const [constituentsRes, analystRes, politicianRes] = await Promise.all([
      db
        .from("index_constituents")
        .select("symbol, name, exchange, exchange_type")
        .eq("active", true),
      db
        .from("analyst_cache")
        .select("symbol, target_mean, current_price, upside_pct, n_analysts")
        .not("upside_pct", "is", null),
      db
        .from("politician_trade_summary")
        .select("symbol, buy_count, sell_count, news_sentiment, trends_direction"),
    ]);

    const allConstituents = (constituentsRes.data ?? []) as Constituent[];
    const byExchange = new Map<Exchange, Constituent[]>();
    for (const c of allConstituents) {
      if (!byExchange.has(c.exchange as Exchange))
        byExchange.set(c.exchange as Exchange, []);
      byExchange.get(c.exchange as Exchange)!.push(c);
    }

    // Step 2: fetch live quotes for all exchanges in parallel
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

    const analystRows = (analystRes.data ?? []) as AnalystRow[];
    const politicianRows = (politicianRes.data ?? []) as PoliticianRow[];

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
          score: 0,
          signalCount: 0,
          outlook: "mixed",
          reasons: [],
        };
        stockMap.set(symbol, s);
      }
      return s;
    };

    for (const row of analystRows) {
      const s = ensure(row.symbol);
      s.upside_pct = row.upside_pct;
      s.current_price = row.current_price;
      s.target_mean = row.target_mean;
      s.n_analysts = row.n_analysts;
    }

    for (const row of politicianRows) {
      const s = ensure(row.symbol);
      s.buy_count = row.buy_count ?? 0;
      s.sell_count = row.sell_count ?? 0;
      s.news_sentiment = row.news_sentiment;
      s.trends_direction = row.trends_direction;
    }

    for (const stock of stockMap.values()) computeScore(stock);

    const top = Array.from(stockMap.values())
      .filter((s) => s.signalCount >= 2 && s.outlook !== "mixed")
      .sort((a, b) => {
        const aPower = Math.abs(a.score) * 10 + a.signalCount;
        const bPower = Math.abs(b.score) * 10 + b.signalCount;
        return bPower - aPower;
      })
      .slice(0, 9);

    return Response.json({ stocks: top });
  } catch (error) {
    console.error("Error in spotlight-discovery:", error);
    return Response.json({ stocks: [], error: String(error) }, { status: 200 });
  }
}
