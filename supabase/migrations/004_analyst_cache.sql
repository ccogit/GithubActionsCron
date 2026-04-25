create table analyst_cache (
  symbol text primary key,
  target_mean numeric,
  current_price numeric,
  upside_pct numeric,
  n_analysts integer,
  updated_at timestamp with time zone default now()
);

create index idx_analyst_cache_upside on analyst_cache(upside_pct desc);
