create table if not exists market_breadth (
  exchange text primary key,
  pct_above_sma50 numeric not null,
  pct_above_sma200 numeric not null,
  updated_at timestamptz not null
);
