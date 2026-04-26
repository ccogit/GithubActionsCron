const ENDPOINT =
  process.env.ALPACA_ENDPOINT ?? "https://paper-api.alpaca.markets/v2";
const DATA_ENDPOINT = "https://data.alpaca.markets/v2";

function headers(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET ?? "",
    "Content-Type": "application/json",
  };
}

export type AlpacaPosition = {
  symbol: string;
  side: "long" | "short";
  qty: string;
  qty_available: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  asset_class: string;
};

export type AlpacaOrder = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  qty: string;
  filled_qty: string;
  limit_price: string | null;
  status: string;
  time_in_force: string;
  created_at: string;
  filled_at: string | null;
};

export async function getPositions(): Promise<AlpacaPosition[]> {
  try {
    const res = await fetch(`${ENDPOINT}/positions`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getOrders(status = "all", limit = 50): Promise<AlpacaOrder[]> {
  try {
    const res = await fetch(
      `${ENDPOINT}/orders?status=${status}&limit=${limit}&direction=desc`,
      { headers: headers(), cache: "no-store" }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export type PortfolioPoint = { timestamp: number; value: number };

const HISTORY_PARAMS: Record<string, { period?: string; timeframe: string }> = {
  "1D":  { period: "1D", timeframe: "5Min" },
  "1W":  { period: "1W", timeframe: "1H" },
  "1Y":  { period: "1A", timeframe: "1D" },
  "MAX": {               timeframe: "1D" },
};

export type HistoricalChanges = {
  prevClose: number | null;
  weekChange: number | null;
  monthChange: number | null;
  ytdChange: number | null;
};

export async function getMultiBarChanges(
  symbols: string[]
): Promise<Record<string, HistoricalChanges>> {
  if (symbols.length === 0) return {};
  try {
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const params = new URLSearchParams({
      symbols: symbols.join(","),
      timeframe: "1Day",
      start: yearStart,
      limit: "260",
      feed: "iex",
      adjustment: "raw",
    });
    const res = await fetch(`${DATA_ENDPOINT}/stocks/bars?${params}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return {};
    const data = await res.json();
    const result: Record<string, HistoricalChanges> = {};
    for (const [sym, rawBars] of Object.entries(data.bars ?? {})) {
      const bars = rawBars as { c: number }[];
      if (bars.length < 2) continue;
      const last = bars[bars.length - 1].c;
      const pct = (ref: number) => ((last - ref) / ref) * 100;
      result[sym] = {
        prevClose: bars[bars.length - 2].c,
        weekChange: bars.length >= 6 ? pct(bars[bars.length - 6].c) : null,
        monthChange: bars.length >= 22 ? pct(bars[bars.length - 22].c) : null,
        ytdChange: pct(bars[0].c),
      };
    }
    return result;
  } catch {
    return {};
  }
}

export async function getPortfolioHistory(range: string): Promise<{
  points: PortfolioPoint[];
  baseValue: number;
}> {
  try {
    const cfg = HISTORY_PARAMS[range] ?? HISTORY_PARAMS["1D"];
    const params = new URLSearchParams({ timeframe: cfg.timeframe });
    if (cfg.period) params.set("period", cfg.period);

    const res = await fetch(
      `${ENDPOINT}/account/portfolio/history?${params}`,
      { headers: headers(), cache: "no-store" }
    );
    if (!res.ok) return { points: [], baseValue: 0 };

    const raw = await res.json();
    const timestamps: number[] = raw.timestamp ?? [];
    const equities: (number | null)[] = raw.equity ?? [];

    const points = timestamps
      .map((ts, i) => ({ timestamp: ts * 1000, value: equities[i] }))
      .filter((p): p is PortfolioPoint => p.value !== null && p.value > 0);

    return { points, baseValue: raw.base_value ?? 0 };
  } catch {
    return { points: [], baseValue: 0 };
  }
}
