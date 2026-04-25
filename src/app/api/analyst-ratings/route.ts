import { NextRequest, NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type AnalystRatings = {
  symbol: string;
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  targetHigh: number | null;
  targetLow: number | null;
  targetMean: number | null;
  targetMedian: number | null;
  currentPrice: number | null;
  numberOfAnalysts: number | null;
  overallRating: string | null;
};

// Module-level cache — survives across requests within the same warm server instance.
let sessionCache: { crumb: string; cookie: string; at: number } | null = null;

async function getYahooSession(): Promise<{ crumb: string; cookie: string } | null> {
  if (sessionCache && Date.now() - sessionCache.at < 30 * 60 * 1000) {
    return sessionCache;
  }
  try {
    // Step 1: get Yahoo consent cookie
    const r1 = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });

    // Collect all Set-Cookie values
    let cookies: string;
    if (typeof r1.headers.getSetCookie === "function") {
      cookies = r1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    } else {
      const raw = r1.headers.get("set-cookie") ?? "";
      // crude parse: split on ", " that precede known cookie names
      cookies = raw.split(/,\s*(?=[A-Za-z_]+=)/).map((c) => c.split(";")[0]).join("; ");
    }

    if (!cookies) return null;

    // Step 2: exchange cookie for crumb
    const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookies },
      signal: AbortSignal.timeout(6000),
    });
    if (!r2.ok) return null;
    const crumb = (await r2.text()).trim();
    if (!crumb || crumb.startsWith("<") || crumb.length > 50) return null;

    sessionCache = { crumb, cookie: cookies, at: Date.now() };
    return sessionCache;
  } catch {
    return null;
  }
}

async function fetchSummary(symbol: string, session: { crumb: string; cookie: string }) {
  const modules = "recommendationTrend,financialData";
  const params = new URLSearchParams({ modules, lang: "en", region: "US", crumb: session.crumb });
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?${params}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Cookie: session.cookie,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  return res;
}

// Fallback: v7 quote endpoint (often works without crumb, returns basic analyst info)
async function fetchV7Quote(symbol: string): Promise<AnalystRatings | null> {
  try {
    const params = new URLSearchParams({ symbols: symbol, lang: "en", region: "US", fields: "regularMarketPrice,averageAnalystRating,targetMeanPrice,numberOfAnalystOpinions" });
    const res = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?${params}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const q = data?.quoteResponse?.result?.[0];
    if (!q) return null;

    // Parse "2.0 - Buy" → "Buy"
    const overallRating = q.averageAnalystRating
      ? String(q.averageAnalystRating).replace(/^\d+(\.\d+)?\s*-\s*/, "")
      : null;

    return {
      symbol,
      period: "latest",
      strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0,
      targetHigh: null,
      targetLow: null,
      targetMean: q.targetMeanPrice ?? null,
      targetMedian: null,
      currentPrice: q.regularMarketPrice ?? null,
      numberOfAnalysts: q.numberOfAnalystOpinions ?? null,
      overallRating,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  // Try full quoteSummary with crumb
  const session = await getYahooSession();
  if (session) {
    try {
      const res = await fetchSummary(symbol, session);

      // On 401, crumb may be stale — invalidate and retry once
      if (res.status === 401) {
        sessionCache = null;
        const fresh = await getYahooSession();
        if (fresh) {
          const retry = await fetchSummary(symbol, fresh);
          if (retry.ok) {
            const d = await retry.json();
            const r = d?.quoteSummary?.result?.[0];
            if (r) return NextResponse.json(parseQuoteSummary(symbol, r));
          }
        }
      } else if (res.ok) {
        const d = await res.json();
        const r = d?.quoteSummary?.result?.[0];
        if (r) return NextResponse.json(parseQuoteSummary(symbol, r));
      }
    } catch {
      // fall through to v7 fallback
    }
  }

  // Fallback: v7 quote with basic info
  const basic = await fetchV7Quote(symbol);
  if (basic) return NextResponse.json(basic);

  return NextResponse.json({ error: "Analyst data unavailable" }, { status: 502 });
}

function parseQuoteSummary(symbol: string, r: Record<string, unknown>): AnalystRatings {
  const trend = (r.recommendationTrend as { trend?: Record<string, number>[] } | undefined)?.trend?.[0];
  const fin = r.financialData as Record<string, { raw?: number }> | undefined;

  return {
    symbol,
    period: (trend as Record<string, unknown>)?.period as string ?? "0m",
    strongBuy: (trend?.strongBuy as number) ?? 0,
    buy: (trend?.buy as number) ?? 0,
    hold: (trend?.hold as number) ?? 0,
    sell: (trend?.sell as number) ?? 0,
    strongSell: (trend?.strongSell as number) ?? 0,
    targetHigh: fin?.targetHighPrice?.raw ?? null,
    targetLow: fin?.targetLowPrice?.raw ?? null,
    targetMean: fin?.targetMeanPrice?.raw ?? null,
    targetMedian: fin?.targetMedianPrice?.raw ?? null,
    currentPrice: fin?.currentPrice?.raw ?? null,
    numberOfAnalysts: fin?.numberOfAnalystOpinions?.raw ?? null,
    overallRating: null,
  };
}
