-- Analyst buy/hold/sell recommendation consensus from Finnhub.
-- consensus_score = (strongBuy×2 + buy − sell − strongSell×2) / total; range −2..+2.
create table analyst_ratings (
  symbol         text primary key,
  strong_buy     int  not null default 0,
  buy            int  not null default 0,
  hold           int  not null default 0,
  sell           int  not null default 0,
  strong_sell    int  not null default 0,
  consensus_score numeric,
  period         text,
  updated_at     timestamp with time zone not null default now()
);

create index idx_analyst_ratings_consensus on analyst_ratings (consensus_score desc);
