create table if not exists market_volatility (
  indicator text primary key, -- 'VIX'
  value numeric not null,
  updated_at timestamptz not null
);
