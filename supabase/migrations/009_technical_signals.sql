-- Finnhub aggregate technical indicator: composite of RSI, MACD, STOCH,
-- SMA, EMA, Bollinger Bands, Williams %R rolled into one buy/neutral/sell signal.
create table technical_signals (
  symbol        text primary key,
  signal        text,            -- 'buy' | 'neutral' | 'sell'
  buy_count     int  not null default 0,
  neutral_count int  not null default 0,
  sell_count    int  not null default 0,
  adx           numeric,         -- Average Directional Index (trend strength 0–100)
  trending      boolean,
  updated_at    timestamp with time zone not null default now()
);

create index idx_technical_signals_signal on technical_signals (signal);
