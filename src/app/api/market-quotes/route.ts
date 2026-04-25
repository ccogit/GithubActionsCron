import { NextRequest, NextResponse } from "next/server";
import { INDEX_STOCKS, EXCHANGE_TYPE } from "@/lib/market-data";

const ALPACA_DATA = "https://data.alpaca.markets/v2";

function alpacaHeaders(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET ?? "",
  };
}

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://finance.yahoo.com",
  "Referer": "https://finance.yahoo.com/",
};

export type QuoteRow = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
};

async function fetchAlpacaQuotes(symbols: string[]): Promise<Record<string, { price: number; change: number; changePct: number }>> {
  try {
    const params = new URLSearchParams({ symbols: symbols.join(","), feed: "iex" });
    const res = await fetch(`${ALPACA_DATA}/stocks/snapshots?${params}`, {
      headers: alpacaHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return {};
    const data = await res.json();
    const out: Record<string, { price: number; change: number; changePct: number }> = {};
    for (const [sym, snap] of Object.entries(data as Record<string, { dailyBar?: { c: number }; prevDailyBar?: { c: number }; latestTrade?: { p: number } }>)) {
      const price = snap.latestTrade?.p ?? snap.dailyBar?.c ?? null;
      const prev = snap.prevDailyBar?.c ?? null;
      if (price === null) continue;
      const change = prev !== null ? price - prev : null;
      const changePct = prev !== null && prev > 0 ? ((price - prev) / prev) * 100 : null;
      out[sym] = { price, change: change ?? 0, changePct: changePct ?? 0 };
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchYahooQuotes(symbols: string[]): Promise<Record<string, { price: number; change: number; changePct: number }>> {
  try {
    const params = new URLSearchParams({ symbols: symbols.join(","), lang: "en", region: "US" });
    const res = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?${params}`, {
      headers: YAHOO_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return {};
    const data = await res.json();
    const results = data?.quoteResponse?.result ?? [];
    const out: Record<string, { price: number; change: number; changePct: number }> = {};
    for (const q of results) {
      if (q.regularMarketPrice == null) continue;
      out[q.symbol] = {
        price: q.regularMarketPrice,
        change: q.regularMarketChange ?? 0,
        changePct: q.regularMarketChangePercent ?? 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const exchange = request.nextUrl.searchParams.get("exchange") ?? "Dow Jones";
  const stocks = INDEX_STOCKS[exchange] ?? [];
  const type = EXCHANGE_TYPE[exchange] ?? "us";
  const symbols = stocks.map((s) => s.symbol);

  const quotes = type === "us"
    ? await fetchAlpacaQuotes(symbols)
    : await fetchYahooQuotes(symbols);

  const rows: QuoteRow[] = stocks.map((s) => {
    const q = quotes[s.symbol];
    return {
      symbol: s.symbol,
      name: s.name,
      price: q?.price ?? null,
      change: q?.change ?? null,
      changePct: q?.changePct ?? null,
      currency: type === "de" ? "EUR" : "USD",
    };
  });

  return NextResponse.json({ rows });
}
