create table if not exists relative_strength (
  symbol text primary key,
  rs_3m numeric not null, -- 3-month relative strength vs benchmark
  rs_6m numeric not null,
  updated_at timestamptz not null
);
