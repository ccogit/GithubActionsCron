export type WatchlistRow = {
  id: string;
  symbol: string;
  min_price: number;
  alert_cooldown_until: string;
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
};
