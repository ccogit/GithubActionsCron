"""Enrich politician trades with free signals: news sentiment, trends, policy events.

Runs daily. Fetches:
1. Recent news sentiment using VADER (free NLP)
2. Google Trends data (free via pytrends)
3. GDELT policy events (free, public data)
"""

import os
import sys
import json
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
from supabase import create_client

try:
    from textblob import TextBlob
    HAS_TEXTBLOB = True
except ImportError:
    HAS_TEXTBLOB = False

try:
    from nltk.sentiment import SentimentIntensityAnalyzer
    import nltk
    nltk.download('vader_lexicon', quiet=True)
    VADER = SentimentIntensityAnalyzer()
    HAS_VADER = True
except ImportError:
    HAS_VADER = False

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]


def get_news_sentiment(symbol: str) -> Optional[dict]:
    """Fetch news for symbol and calculate sentiment using free APIs."""
    try:
        # Use NewsAPI free tier (3 articles/day free, but we can use it)
        # Alternative: Use GDELT (free, no key needed)
        url = "https://newsapi.org/v2/everything"
        params = {
            "q": symbol,
            "sortBy": "publishedAt",
            "language": "en",
            "pageSize": 10,
        }

        # Try with key if available, otherwise use free approach
        if os.environ.get("NEWSAPI_KEY"):
            params["apiKey"] = os.environ["NEWSAPI_KEY"]
            r = requests.get(url, params=params, timeout=10)
        else:
            # Fallback: Use GDELT for free news analysis
            return get_gdelt_sentiment(symbol)

        if not r.ok or not r.json().get("articles"):
            return None

        articles = r.json()["articles"][:5]  # Limit to 5 articles

        # Calculate sentiment using VADER (free, comes with NLTK)
        if not HAS_VADER:
            return None

        sentiments = []
        for article in articles:
            text = f"{article.get('title', '')} {article.get('description', '')}"
            if not text.strip():
                continue

            scores = VADER.polarity_scores(text)
            sentiments.append(scores["compound"])  # -1 to 1

        if not sentiments:
            return None

        avg_sentiment = sum(sentiments) / len(sentiments)
        return {
            "sentiment": avg_sentiment,
            "count": len(sentiments),
            "articles": [
                {
                    "title": a.get("title"),
                    "url": a.get("url"),
                    "published": a.get("publishedAt"),
                }
                for a in articles[:3]
            ],
        }

    except Exception as e:
        print(f"  Error getting news sentiment for {symbol}: {e}", file=sys.stderr)
        return None


def get_gdelt_sentiment(symbol: str) -> Optional[dict]:
    """Fetch sentiment from GDELT (free, global event database)."""
    try:
        # GDELT provides free access to global news events and sentiment
        # Using the public GDELT 2.0 API
        url = "https://api.gdeltproject.org/api/v2/tone/search"
        params = {
            "query": symbol,
            "format": "json",
            "maxrecords": 10,
            "timespan": "7d",
        }

        r = requests.get(url, params=params, timeout=30)  # Increased timeout
        if not r.ok:
            return None

        data = r.json()
        if "tone" not in data or not data["tone"]:
            return None

        # GDELT returns tone scores (-100 to 100)
        tones = [float(t["tone"]) for t in data["tone"] if t.get("tone")]
        if not tones:
            return None

        avg_tone = sum(tones) / len(tones)
        # Normalize -100..100 to -1..1
        sentiment = avg_tone / 100.0

        return {
            "sentiment": sentiment,
            "count": len(tones),
            "source": "GDELT",
        }

    except Exception as e:
        print(f"  Error getting GDELT sentiment for {symbol}: {e}", file=sys.stderr)
        return None


def get_google_trends(symbol: str) -> Optional[dict]:
    """Get Google Trends data using pytrends (free)."""
    try:
        from pytrends.request import TrendReq

        pytrends = TrendReq(hl='en-US', tz=360)
        # Get last 30 days of trends
        pytrends.build_payload([symbol], timeframe='today 1-m')
        trends = pytrends.interest_over_time()

        if trends.empty or symbol not in trends.columns:
            return None

        values = trends[symbol].values
        current = values[-1]
        prev = values[-7] if len(values) > 7 else values[0]

        # Determine direction
        if current > prev * 1.1:
            direction = "rising"
        elif current < prev * 0.9:
            direction = "falling"
        else:
            direction = "stable"

        return {
            "score": int(current),
            "direction": direction,
            "change_7d": ((current - prev) / prev) * 100 if prev > 0 else 0,
        }

    except Exception as e:
        print(f"  Error getting trends for {symbol}: {e}", file=sys.stderr)
        return None


def get_policy_events(symbol: str) -> Optional[list]:
    """Fetch relevant policy events from GDELT. Non-blocking - errors are silent."""
    try:
        url = "https://api.gdeltproject.org/api/v2/tone/search"
        params = {
            "query": f"policy regulation {symbol}",
            "format": "json",
            "maxrecords": 5,
            "timespan": "30d",
        }

        r = requests.get(url, params=params, timeout=20)  # Increased timeout
        if not r.ok or "tone" not in r.json():
            return None

        events = r.json().get("tone", [])[:3]
        return [
            {
                "date": e.get("date"),
                "tone": e.get("tone"),
                "source": e.get("source"),
            }
            for e in events
        ]

    except Exception as e:
        # Silent fail - policy events are optional enrichment
        return None


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

    print("Enriching politician trades with free signals...")

    # Get all symbols with recent trades
    try:
        symbols_res = db.table("politician_trade_summary").select("symbol").execute()
        symbols = [row["symbol"] for row in symbols_res.data or []]
    except Exception as e:
        print(f"Error fetching symbols: {e}", file=sys.stderr)
        return 1

    enriched = 0
    failed = 0

    for i, symbol in enumerate(symbols):
        try:
            print(f"  [{i+1}/{len(symbols)}] {symbol}...", end=" ", flush=True)

            # Fetch signals (GDELT is optional, sentiment/trends are core)
            sentiment_data = get_news_sentiment(symbol)
            trends_data = get_google_trends(symbol)
            events_data = get_policy_events(symbol)  # Silent fails OK

            # Skip if no core data
            if not sentiment_data and not trends_data:
                print("no data")
                continue

            # Update database
            update_payload = {
                "sentiment_last_updated": datetime.now(timezone.utc).isoformat(),
            }

            if sentiment_data:
                update_payload["news_sentiment"] = sentiment_data["sentiment"]
                update_payload["news_sentiment_count"] = sentiment_data["count"]
                print(f"sentiment={sentiment_data['sentiment']:.2f}", end=" ", flush=True)

            if trends_data:
                update_payload["trends_score"] = trends_data["score"]
                update_payload["trends_direction"] = trends_data["direction"]
                print(f"trends={trends_data['direction']}", end=" ", flush=True)

            if events_data:
                update_payload["policy_events"] = json.dumps(events_data)
                print(f"events={len(events_data)}", end=" ", flush=True)

            db.table("politician_trade_summary").update(update_payload).eq(
                "symbol", symbol
            ).execute()

            enriched += 1
            print(" ✓")

        except Exception as e:
            failed += 1
            print(f" ✗ DB error", file=sys.stderr)

    print()
    print("=" * 50)
    print(f"Enriched:  {enriched}")
    print(f"Failed:    {failed}")
    print("=" * 50)

    return 0 if enriched > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
