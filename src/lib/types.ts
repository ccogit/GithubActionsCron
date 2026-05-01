export type WatchlistRow = {
  id: string;
  symbol: string;
  min_price: number;
  alert_active: boolean;
  created_at: string;
};

export type PriceTick = {
  id: number;
  symbol: string;
  price: number;
  fetched_at: string;
};

export type AlertLogRow = {
  id: number;
  symbol: string;
  price: number;
  min_price: number;
  sent_at: string;
  email_sent: boolean | null;
  order_placed: boolean | null;
  order_id: string | null;
};

export type OptionsFlowRow = {
  symbol: string;
  unusual_contracts: number;
  unusual_calls: number;
  unusual_puts: number;
  call_put_skew: number;
  total_volume_unusual: number;
  updated_at: string;
};
