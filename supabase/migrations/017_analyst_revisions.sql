create table if not exists analyst_revisions (
  symbol text primary key,
  rev_up_30d int not null default 0,
  rev_down_30d int not null default 0,
  rev_ratio numeric, -- rev_up / (rev_up + rev_down)
  updated_at timestamptz not null
);
