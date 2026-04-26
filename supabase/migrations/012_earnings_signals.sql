-- Earnings surprise beat rate: fraction of the last N quarters where the
-- company reported EPS >= analyst consensus estimate.
-- beat_rate = 1.0 means all checked quarters beat; 0.0 means all missed.
create table earnings_signals (
  symbol           text primary key,
  beat_rate        numeric,   -- 0.0–1.0
  avg_surprise_pct numeric,   -- average EPS surprise % (positive = beat)
  quarters_checked int,
  updated_at       timestamp with time zone not null default now()
);

create index idx_earnings_signals_beat_rate on earnings_signals (beat_rate desc);
