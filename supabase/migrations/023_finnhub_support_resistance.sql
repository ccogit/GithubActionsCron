create table if not exists finnhub_support_resistance (
  symbol text primary key,
  levels numeric[] not null, -- Array of support/resistance price levels
  updated_at timestamptz not null
);
