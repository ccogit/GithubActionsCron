-- Social sentiment from Reddit (Tradestie WSB + ApeWisdom all-stocks).
-- wsb_sentiment_score: 0–1 from Tradestie (>0.6 bullish, <0.4 bearish).
-- reddit_rank_change: positive = rising (more mentions than 24h ago).
create table social_sentiment (
  symbol               text primary key,
  wsb_comments         int,
  wsb_sentiment        text,      -- 'Bullish' | 'Bearish'
  wsb_sentiment_score  numeric,   -- 0–1 (Tradestie)
  reddit_mentions_24h  int,
  reddit_upvotes       int,
  reddit_rank          int,
  reddit_rank_change   int,       -- positive = rank improved (more buzz)
  updated_at           timestamp with time zone not null default now()
);

create index idx_social_sentiment_wsb on social_sentiment (wsb_sentiment_score desc);
