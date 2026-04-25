import { createClient } from "@/lib/supabase/server";
import { INDEX_STOCKS } from "@/lib/market-data";
import { fetchQuotesForExchange, type QuoteRow } from "@/lib/market-quotes";

export const revalidate = 300;

const EXCHANGES = ["Dow Jones", "Nasdaq 100", "DAX"] as const;

interface HotStock {
  exchange: string;
  symbol: string;
  name: string;
  currentPrice: number;
  targetMean: number | null;
  upside: number | null;
  nAnalysts: number | null;
}

interface Mover {
  exchange: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
}

interface Earning {
  symbol: string;
  name: string;
  date: string;
  epsEstimate: number | null;
}

type AnalystCacheRow = {
  symbol: string;
  target_mean: number | null;
  n_analysts: number | null;
};

async function fetchEarningsThisWeek(): Promise<Earning[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];

  try {
    const today = new Date();
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${today.toISOString().split("T")[0]}&to=${
        weekFromNow.toISOString().split("T")[0]
      }&token=${apiKey}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) return [];

    const indexSymbols = new Set(
      Object.values(INDEX_STOCKS).flat().map((s) => s.symbol.replace(".DE", ""))
    );

    const data = await res.json();
    const all: Earning[] = (data.earnings || [])
      .filter((e: { symbol: string }) => indexSymbols.has(e.symbol))
      .slice(0, 10)
      .map((e: { symbol: string; date?: string; epsEstimate?: number }) => ({
        symbol: e.symbol,
        name: e.symbol,
        date: e.date || "",
        epsEstimate: e.epsEstimate ?? null,
      }));

    return all;
  } catch (error) {
    console.error("Error fetching earnings:", error);
    return [];
  }
}

export async function GET() {
  try {
    const db = createClient();

    // Fetch quotes for all 3 exchanges and analyst cache in parallel
    const [dowQuotes, nasdaqQuotes, daxQuotes, cacheRes] = await Promise.all([
      fetchQuotesForExchange("Dow Jones"),
      fetchQuotesForExchange("Nasdaq 100"),
      fetchQuotesForExchange("DAX"),
      db.from("analyst_cache").select("symbol, target_mean, n_analysts"),
    ]);

    const cached = (cacheRes.data ?? []) as AnalystCacheRow[];
    const cacheMap = new Map(cached.map((c) => [c.symbol, c]));

    const quotesByExchange: Record<string, QuoteRow[]> = {
      "Dow Jones": dowQuotes,
      "Nasdaq 100": nasdaqQuotes,
      DAX: daxQuotes,
    };

    // Hot stocks: top 3 per exchange by analyst upside
    const hotStocks: HotStock[] = [];
    for (const exchange of EXCHANGES) {
      const candidates: HotStock[] = [];
      for (const quote of quotesByExchange[exchange]) {
        if (!quote.price) continue;
        const cache = cacheMap.get(quote.symbol);
        if (!cache?.target_mean) continue;
        const upside = ((cache.target_mean - quote.price) / quote.price) * 100;
        candidates.push({
          exchange,
          symbol: quote.symbol,
          name: quote.name,
          currentPrice: quote.price,
          targetMean: cache.target_mean,
          upside,
          nAnalysts: cache.n_analysts,
        });
      }
      candidates.sort((a, b) => (b.upside ?? 0) - (a.upside ?? 0));
      hotStocks.push(...candidates.slice(0, 3));
    }

    // Top movers: top 3 by abs(daily %) per exchange
    const topMovers: Mover[] = [];
    for (const exchange of EXCHANGES) {
      const candidates: Mover[] = [];
      for (const quote of quotesByExchange[exchange]) {
        if (quote.price == null || quote.change == null || quote.changePct == null) continue;
        candidates.push({
          exchange,
          symbol: quote.symbol,
          name: quote.name,
          price: quote.price,
          change: quote.change,
          changePct: quote.changePct,
        });
      }
      candidates.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
      topMovers.push(...candidates.slice(0, 3));
    }

    const earnings = await fetchEarningsThisWeek();

    return Response.json({ hotStocks, topMovers, earnings });
  } catch (error) {
    console.error("Error in market-aggregates:", error);
    return Response.json(
      { hotStocks: [], topMovers: [], earnings: [], error: String(error) },
      { status: 200 }
    );
  }
}
