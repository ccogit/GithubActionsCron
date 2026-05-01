create table if not exists finnhub_technical_advisory (
  symbol text primary key,
  advisory text not null, -- 'Strong Buy', 'Buy', 'Neutral', 'Sell', 'Strong Sell'
  buy_count int not null,
  sell_count int not null,
  neutral_count int not null,
  updated_at timestamptz not null
);
