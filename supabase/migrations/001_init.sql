-- watchlist: stocks to monitor with per-symbol alert threshold
create table if not exists watchlist (
  id                   uuid primary key default gen_random_uuid(),
  symbol               text not null unique,
  min_price            numeric(12,4) not null default 0,
  alert_cooldown_until timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

-- price_ticks: raw price feed
create table if not exists price_ticks (
  id         bigserial primary key,
  symbol     text not null,
  price      numeric(12,4) not null,
  fetched_at timestamptz not null default now()
);

create index if not exists price_ticks_symbol_fetched
  on price_ticks (symbol, fetched_at desc);

-- alert_log: history of sent emails
create table if not exists alert_log (
  id         bigserial primary key,
  symbol     text not null,
  price      numeric(12,4) not null,
  min_price  numeric(12,4) not null,
  sent_at    timestamptz not null default now()
);

-- retention: delete ticks older than 30 days
-- enable pg_cron in Supabase dashboard (Database → Extensions), then run:
-- select cron.schedule('purge-ticks', '0 3 * * *',
--   $$delete from price_ticks where fetched_at < now() - interval '30 days'$$);
