-- Index constituents: tracks which stocks belong to each index.
-- Populated nightly by worker/refresh_index_constituents.py.
CREATE TABLE IF NOT EXISTS index_constituents (
  symbol       TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  exchange     TEXT        NOT NULL,       -- 'Dow Jones' | 'Nasdaq 100' | 'DAX'
  exchange_type TEXT       NOT NULL DEFAULT 'us',  -- 'us' | 'de'
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, exchange)
);

CREATE INDEX IF NOT EXISTS idx_index_constituents_exchange_active
  ON index_constituents(exchange) WHERE active = TRUE;
