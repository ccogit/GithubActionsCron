import { createClient } from "@/lib/supabase/server";
import { fetchQuotesForExchange, type QuoteRow } from "@/lib/market-quotes";

export const revalidate = 300;

const EXCHANGES = ["Dow Jones", "Nasdaq 100", "DAX"] as const;
type Exchange = (typeof EXCHANGES)[number];

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

type Constituent = {
  symbol: string;
  name: string;
  exchange: string;
  exchange_type: string;
};

async function fetchEarningsThisWeek(
  indexSymbols: Set<string>
): Promise<Earning[]> {
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

    const data = await res.json();
    return (data.earnings || [])
      .filter((e: { symbol: string }) =>
        indexSymbols.has(e.symbol.replace(".DE", ""))
      )
      .slice(0, 10)
      .map((e: { symbol: string; date?: string; epsEstimate?: number }) => ({
        symbol: e.symbol,
        name: e.symbol,
        date: e.date || "",
        epsEstimate: e.epsEstimate ?? null,
      }));
  } catch (error) {
    console.error("Error fetching earnings:", error);
    return [];
  }
}

export async function GET() {
  try {
    const db = createClient();

    // Step 1: fetch constituents and analyst cache in parallel
    const [constituentsRes, cacheRes] = await Promise.all([
      db
        .from("index_constituents")
        .select("symbol, name, exchange, exchange_type")
        .eq("active", true),
      db.from("analyst_cache").select("symbol, target_mean, n_analysts"),
    ]);

    const allConstituents = (constituentsRes.data ?? []) as Constituent[];
    const byExchange = new Map<Exchange, Constituent[]>();
    for (const c of allConstituents) {
      if (!byExchange.has(c.exchange as Exchange))
        byExchange.set(c.exchange as Exchange, []);
      byExchange.get(c.exchange as Exchange)!.push(c);
    }

    // Step 2: fetch live quotes for all three exchanges in parallel
    const [dowQuotes, nasdaqQuotes, daxQuotes] = await Promise.all([
      fetchQuotesForExchange(byExchange.get("Dow Jones") ?? [], "us"),
      fetchQuotesForExchange(byExchange.get("Nasdaq 100") ?? [], "us"),
      fetchQuotesForExchange(byExchange.get("DAX") ?? [], "de"),
    ]);

    const cached = (cacheRes.data ?? []) as AnalystCacheRow[];
    const cacheMap = new Map(cached.map((c) => [c.symbol, c]));

    const quotesByExchange: Record<Exchange, QuoteRow[]> = {
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
        if (quote.price == null || quote.change == null || quote.changePct == null)
          continue;
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

    const indexSymbols = new Set(allConstituents.map((c) => c.symbol.replace(".DE", "")));
    const earnings = await fetchEarningsThisWeek(indexSymbols);

    return Response.json({ hotStocks, topMovers, earnings });
  } catch (error) {
    console.error("Error in market-aggregates:", error);
    return Response.json(
      { hotStocks: [], topMovers: [], earnings: [], error: String(error) },
      { status: 200 }
    );
  }
}
