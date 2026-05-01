create table if not exists options_flow (
  symbol text primary key,
  unusual_contracts int not null,
  unusual_calls int not null,
  unusual_puts int not null,
  call_put_skew numeric not null,
  total_volume_unusual bigint not null,
  updated_at timestamptz not null
);
