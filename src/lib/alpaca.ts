const ENDPOINT =
  process.env.ALPACA_ENDPOINT ?? "https://paper-api.alpaca.markets/v2";

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
