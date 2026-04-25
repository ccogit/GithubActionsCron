import { NextRequest, NextResponse } from "next/server";

const DATA_ENDPOINT = "https://data.alpaca.markets/v2";

function headers(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET ?? "",
  };
}

const PERIOD_CONFIGS: Record<string, { timeframe: string; daysBack: number }> = {
  "1D": { timeframe: "5Min", daysBack: 1 },
  "1W": { timeframe: "1Hour", daysBack: 7 },
  "1M": { timeframe: "1Day", daysBack: 30 },
  "3M": { timeframe: "1Day", daysBack: 90 },
};

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const period = request.nextUrl.searchParams.get("period") ?? "1D";

  if (!symbol) return NextResponse.json({ bars: [] }, { status: 400 });

  const cfg = PERIOD_CONFIGS[period] ?? PERIOD_CONFIGS["1D"];
  const end = new Date();
  const start = new Date(end.getTime() - cfg.daysBack * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeframe: cfg.timeframe,
    start: start.toISOString(),
    end: end.toISOString(),
    limit: "1000",
    feed: "iex",
  });

  try {
    const res = await fetch(
      `${DATA_ENDPOINT}/stocks/${symbol}/bars?${params}`,
      { headers: headers(), cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ bars: [] });
    const raw = await res.json();
    const bars = (raw.bars ?? []).map((b: { t: string; c: number }) => ({
      time: b.t,
      price: b.c,
    }));
    return NextResponse.json({ bars });
  } catch {
    return NextResponse.json({ bars: [] });
  }
}
