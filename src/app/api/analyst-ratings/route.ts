import { NextRequest, NextResponse } from "next/server";

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://finance.yahoo.com",
  "Referer": "https://finance.yahoo.com/",
};

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
};

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const modules = "recommendationTrend,financialData";
  const params = new URLSearchParams({ modules, lang: "en", region: "US" });
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?${params}`;

  try {
    const res = await fetch(url, { headers: YAHOO_HEADERS, cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: `Yahoo returned ${res.status}` }, { status: 502 });

    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return NextResponse.json({ error: "No data" }, { status: 404 });

    const trend = result.recommendationTrend?.trend?.[0]; // most recent period
    const fin = result.financialData;

    const ratings: AnalystRatings = {
      symbol,
      period: trend?.period ?? "0m",
      strongBuy: trend?.strongBuy ?? 0,
      buy: trend?.buy ?? 0,
      hold: trend?.hold ?? 0,
      sell: trend?.sell ?? 0,
      strongSell: trend?.strongSell ?? 0,
      targetHigh: fin?.targetHighPrice?.raw ?? null,
      targetLow: fin?.targetLowPrice?.raw ?? null,
      targetMean: fin?.targetMeanPrice?.raw ?? null,
      targetMedian: fin?.targetMedianPrice?.raw ?? null,
      currentPrice: fin?.currentPrice?.raw ?? null,
      numberOfAnalysts: fin?.numberOfAnalystOpinions?.raw ?? null,
    };

    return NextResponse.json(ratings);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
