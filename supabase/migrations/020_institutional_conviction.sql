create table if not exists institutional_conviction (
  symbol text primary key,
  pct_held_institutions numeric not null,
  pct_held_insiders numeric not null,
  updated_at timestamptz not null
);
