-- Economic indicators from FRED (Federal Reserve Economic Data)
-- Tracks major US economic metrics that influence market sentiment

create table if not exists economic_indicators (
  indicator text primary key,
  label text not null,
  value float not null,
  observation_date date not null,
  fetched_at timestamp with time zone not null
);

-- Index for lookups
create index if not exists idx_economic_indicators_fetched
  on economic_indicators(fetched_at desc);
