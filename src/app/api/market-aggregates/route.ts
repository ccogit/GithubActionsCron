import { createClient } from "@/lib/supabase/server";
import { INDEX_STOCKS } from "@/lib/market-data";
import type { QuoteRow } from "@/app/api/market-quotes/route";
import type { NextRequest } from "next/server";

export const revalidate = 300; // Cache for 5 minutes

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

async function fetchHotStocks(): Promise<HotStock[]> {
  const db = createClient();
  const hotStocks: HotStock[] = [];
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  for (const [exchange, stocks] of Object.entries(INDEX_STOCKS)) {
    try {
      const symbols = stocks.map((s) => s.symbol);

      // Fetch current quotes
      const quoteRes = await fetch(
        `${baseUrl}/api/market-quotes?symbols=${symbols.join(",")}&exchange=${encodeURIComponent(exchange)}`,
        { next: { revalidate: 60 } }
      );
      if (!quoteRes.ok) continue;

      const quotes: QuoteRow[] = await quoteRes.json();
      const quoteMap = new Map(quotes.map((q: QuoteRow) => [q.symbol, q]));

      // Fetch analyst targets from cache
      const { data: cached } = await db
        .from("analyst_cache")
        .select("*")
        .in("symbol", symbols);

      const cacheMap = new Map(
        (cached || []).map((c: any) => [c.symbol, c])
      );

      // Compute upside for each stock
      for (const stock of stocks) {
        const quote = quoteMap.get(stock.symbol);
        const cache = cacheMap.get(stock.symbol);

        if (quote && quote.price && cache?.target_mean) {
          const upside =
            ((cache.target_mean - quote.price) / quote.price) * 100;
          hotStocks.push({
            exchange,
            symbol: stock.symbol,
            name: stock.name,
            currentPrice: quote.price,
            targetMean: cache.target_mean,
            upside,
            nAnalysts: cache.n_analysts,
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching hot stocks for ${exchange}:`, error);
    }
  }

  // Sort by upside and return top 3 per exchange
  const result: HotStock[] = [];
  for (const ex of ["Dow Jones", "Nasdaq 100", "DAX"]) {
    const exStocks = hotStocks.filter((s) => s.exchange === ex);
    exStocks.sort((a, b) => (b.upside || 0) - (a.upside || 0));
    result.push(...exStocks.slice(0, 3));
  }

  return result;
}

async function fetchTopMovers(): Promise<Mover[]> {
  const movers: Mover[] = [];
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  for (const [exchange, stocks] of Object.entries(INDEX_STOCKS)) {
    try {
      const symbols = stocks.map((s) => s.symbol);
      const symbolMap = new Map(stocks.map((s) => [s.symbol, s.name]));

      // Fetch quotes to compute daily changes
      const quoteRes = await fetch(
        `${baseUrl}/api/market-quotes?symbols=${symbols.join(",")}&exchange=${encodeURIComponent(exchange)}`,
        { next: { revalidate: 60 } }
      );
      if (!quoteRes.ok) continue;

      const quotes: QuoteRow[] = await quoteRes.json();

      quotes.forEach((quote: QuoteRow) => {
        if (quote.price && quote.change !== null && quote.changePct !== null) {
          movers.push({
            exchange,
            symbol: quote.symbol,
            name: symbolMap.get(quote.symbol) || quote.symbol,
            price: quote.price,
            change: quote.change,
            changePct: quote.changePct,
          });
        }
      });
    } catch (error) {
      console.error(`Error fetching movers for ${exchange}:`, error);
    }
  }

  // Sort by changePct and return top 3 gainers + 3 losers per exchange
  const result: Mover[] = [];
  for (const ex of ["Dow Jones", "Nasdaq 100", "DAX"]) {
    const exMovers = movers.filter((m) => m.exchange === ex);
    exMovers.sort((a, b) => b.changePct - a.changePct);

    // Top 3 gainers
    result.push(...exMovers.slice(0, 3));
    // Top 3 losers
    result.push(...exMovers.slice(-3));
  }

  return result;
}

async function fetchEarningsThisWeek(): Promise<Earning[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];

  try {
    const today = new Date();
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${today.toISOString().split("T")[0]}&to=${weekFromNow.toISOString().split("T")[0]}&token=${apiKey}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const earnings: Earning[] = (data.earnings || [])
      .slice(0, 10)
      .map((e: any) => ({
        symbol: e.symbol,
        name: e.name,
        date: e.revenueEstimate?.earningsDate || e.revenueEstimate?.date || "",
        epsEstimate: e.epsEstimate?.estimate || null,
      }));

    return earnings;
  } catch (error) {
    console.error("Error fetching earnings:", error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const [hotStocks, topMovers, earnings] = await Promise.all([
      fetchHotStocks(),
      fetchTopMovers(),
      fetchEarningsThisWeek(),
    ]);

    return Response.json({
      hotStocks,
      topMovers,
      earnings,
    });
  } catch (error) {
    console.error("Error in market-aggregates:", error);
    return Response.json(
      { error: "Failed to fetch market aggregates" },
      { status: 500 }
    );
  }
}
