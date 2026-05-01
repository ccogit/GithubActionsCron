create table if not exists finnhub_metrics (
  symbol text primary key,
  pe_ttm numeric,
  dividend_yield numeric,
  high_52w numeric,
  low_52w numeric,
  updated_at timestamptz not null
);
