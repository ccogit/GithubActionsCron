-- Short interest as a percentage of float from FINRA/yfinance.
-- High short interest (>15% float) reflects professional bearish conviction.
create table short_interest_cache (
  symbol          text primary key,
  short_pct_float numeric,    -- e.g. 0.15 = 15 % of float sold short
  short_ratio     numeric,    -- days-to-cover (shares_short / avg_daily_volume)
  shares_short    bigint,
  updated_at      timestamp with time zone not null default now()
);

create index idx_short_interest_pct on short_interest_cache (short_pct_float desc);
