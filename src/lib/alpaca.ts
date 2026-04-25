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
