-- Add enrichment columns to politician trade summary
ALTER TABLE politician_trade_summary
ADD COLUMN IF NOT EXISTS news_sentiment NUMERIC, -- -1 to 1 (negative to positive)
ADD COLUMN IF NOT EXISTS news_sentiment_count INT, -- Number of articles analyzed
ADD COLUMN IF NOT EXISTS trends_score NUMERIC, -- 0-100 relative search interest
ADD COLUMN IF NOT EXISTS trends_direction TEXT, -- 'rising', 'falling', 'stable'
ADD COLUMN IF NOT EXISTS policy_events JSONB, -- Array of relevant GDELT events
ADD COLUMN IF NOT EXISTS sentiment_last_updated TIMESTAMP;

-- Index for sentiment-based queries
CREATE INDEX IF NOT EXISTS idx_politician_sentiment ON politician_trade_summary(news_sentiment DESC);
CREATE INDEX IF NOT EXISTS idx_politician_trends ON politician_trade_summary(trends_score DESC);
