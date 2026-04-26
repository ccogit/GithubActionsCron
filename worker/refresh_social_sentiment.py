"""Fetch retail social sentiment from Tradestie WSB API and ApeWisdom.

Runs hourly. Both APIs are free and require no authentication.
- Tradestie: Top 50 WSB stocks, updates every 15 minutes
- ApeWisdom: All Reddit investment subreddits, broader coverage

Stores per-symbol: comment count, sentiment label, sentiment score.
"""

import os
import requests
import sys
import time
from datetime import datetime, timezone

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

TRADESTIE_URL = "https://api.tradestie.com/v1/apps/reddit"
APEWISDOM_URL = "https://apewisdom.io/api/v1.0/filter/all-stocks"


def fetch_tradestie_sentiment() -> dict[str, dict]:
    """Fetch top 50 WSB stocks from Tradestie. Returns {symbol: data} mapping."""
    try:
        resp = requests.get(TRADESTIE_URL, timeout=15)
        if resp.status_code != 200:
            print(f"  Tradestie returned {resp.status_code}", file=sys.stderr)
            return {}

        results = {}
        for item in resp.json():
            ticker = item.get("ticker", "").upper()
            if not ticker:
                continue
            results[ticker] = {
                "wsb_comments": item.get("no_of_comments", 0),
                "wsb_sentiment": item.get("sentiment", ""),          # "Bullish" or "Bearish"
                "wsb_sentiment_score": item.get("sentiment_score", 0.0),
            }
        return results

    except Exception as e:
        print(f"  Tradestie error: {e}", file=sys.stderr)
        return {}


def fetch_apewisdom_sentiment() -> dict[str, dict]:
    """Fetch all-stocks leaderboard from ApeWisdom. Returns {symbol: data} mapping."""
    try:
        resp = requests.get(APEWISDOM_URL, timeout=15)
        if resp.status_code != 200:
            print(f"  ApeWisdom returned {resp.status_code}", file=sys.stderr)
            return {}

        data = resp.json()
        results = {}
        for item in data.get("results", []):
            ticker = item.get("ticker", "").upper()
            if not ticker:
                continue
            mentions = int(item.get("mentions", 0))
            results[ticker] = {
                "reddit_mentions_24h": mentions,
                "reddit_upvotes": int(item.get("upvotes", 0)),
                "reddit_rank": item.get("rank", None),
                "reddit_rank_24h_ago": item.get("rank_24h_ago", None),
                # Calculate a simple momentum: negative = rising (lower rank number)
                "reddit_rank_change": None,
            }
            rank_24h = item.get("rank_24h_ago")
            rank_now = item.get("rank")
            if rank_now is not None and rank_24h is not None:
                results[ticker]["reddit_rank_change"] = int(rank_24h) - int(rank_now)

        return results

    except Exception as e:
        print(f"  ApeWisdom error: {e}", file=sys.stderr)
        return {}


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    now = datetime.now(timezone.utc).isoformat()

    print("Refreshing social sentiment...")

    # Fetch both sources
    print("  Fetching Tradestie (WSB)...")
    tradestie_data = fetch_tradestie_sentiment()
    print(f"    Got {len(tradestie_data)} tickers")

    print("  Fetching ApeWisdom (all Reddit)...")
    apewisdom_data = fetch_apewisdom_sentiment()
    print(f"    Got {len(apewisdom_data)} tickers")

    # Merge: collect all tickers from both sources
    all_tickers = set(tradestie_data.keys()) | set(apewisdom_data.keys())
    if not all_tickers:
        print("  No data from either source. Exiting.")
        return 1

    updated = 0
    for ticker in all_tickers:
        t_data = tradestie_data.get(ticker, {})
        a_data = apewisdom_data.get(ticker, {})

        payload = {
            "symbol": ticker,
            "updated_at": now,
        }
        if t_data:
            payload["wsb_comments"] = t_data["wsb_comments"]
            payload["wsb_sentiment"] = t_data["wsb_sentiment"]
            payload["wsb_sentiment_score"] = t_data["wsb_sentiment_score"]
        if a_data:
            payload["reddit_mentions_24h"] = a_data["reddit_mentions_24h"]
            payload["reddit_upvotes"] = a_data["reddit_upvotes"]
            payload["reddit_rank"] = a_data["reddit_rank"]
            payload["reddit_rank_change"] = a_data["reddit_rank_change"]

        try:
            db.table("social_sentiment").upsert(payload, on_conflict="symbol").execute()
            updated += 1
        except Exception as e:
            print(f"  DB error for {ticker}: {e}", file=sys.stderr)

    print()
    print("=" * 50)
    print(f"Tradestie tickers:     {len(tradestie_data)}")
    print(f"ApeWisdom tickers:     {len(apewisdom_data)}")
    print(f"Total upserted:        {updated}")
    print("=" * 50)

    return 0


if __name__ == "__main__":
    sys.exit(main())