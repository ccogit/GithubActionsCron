-- Raw politician trades from AInvest
CREATE TABLE politician_trades (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  trade_type TEXT NOT NULL, -- 'buy' or 'sell'
  trade_date DATE NOT NULL,
  filing_date DATE,
  size TEXT,
  state TEXT,
  party TEXT,
  reporting_gap INT,
  fetched_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(id, symbol)
);

CREATE INDEX idx_politician_trades_symbol ON politician_trades(symbol);
CREATE INDEX idx_politician_trades_date ON politician_trades(trade_date DESC);

-- Aggregated summary for each symbol
CREATE TABLE politician_trade_summary (
  symbol TEXT PRIMARY KEY,
  buy_count INT DEFAULT 0,
  sell_count INT DEFAULT 0,
  buy_ratio NUMERIC DEFAULT 0, -- buy_count / (buy_count + sell_count)
  top_buyers JSONB, -- Array of top 3 buyers with counts
  top_sellers JSONB, -- Array of top 3 sellers with counts
  last_7_days TEXT, -- JSON array of recent trades
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_politician_summary_ratio ON politician_trade_summary(buy_ratio DESC);
