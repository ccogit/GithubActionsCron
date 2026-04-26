"""Enrich politician trades with news sentiment and momentum-based trends.

Replaces two slow external APIs with yfinance (no key, no rate limits):

  Old approach (sequential, ~20+ min):
    GDELT API    — 30-second timeouts, two calls per symbol, often empty
    pytrends     — scrapes Google, rate-limited, 5-10s per symbol, fragile
    NewsAPI      — optional key, limited free tier

  New approach (parallel, ~2 min):
    yfinance.news   → VADER-score headlines for news_sentiment
    yfinance.history → volume + price momentum for trends_direction

8 parallel workers cut wall-clock time by ~8×. No external API keys needed.
"""

import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Optional

import yfinance as yf
from supabase import create_client

try:
    import nltk
    nltk.download("vader_lexicon", quiet=True)
    from nltk.sentiment import SentimentIntensityAnalyzer
    VADER = SentimentIntensityAnalyzer()
    HAS_VADER = True
except Exception:
    HAS_VADER = False

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

MAX_WORKERS = 8


def _news_sentiment(ticker: yf.Ticker) -> Optional[float]:
    """VADER-score recent Yahoo Finance news titles. Returns −1..+1 or None."""
    if not HAS_VADER:
        return None
    try:
        news = ticker.news or []
        scores = []
        for a in news[:10]:
            # yfinance ≥0.2.x nests title under "content"; older versions expose it top-level
            title = (a.get("content") or {}).get("title") or a.get("title") or ""
            if title:
                scores.append(VADER.polarity_scores(title)["compound"])
        return round(sum(scores) / len(scores), 4) if scores else None
    except Exception:
        return None


def _volume_trend(ticker: yf.Ticker) -> Optional[str]:
    """Classify attention direction from 5-day vs 20-day volume + 5-day price return."""
    try:
        hist = ticker.history(period="3mo")
        if hist.empty or len(hist) < 20:
            return None

        vol   = hist["Volume"]
        avg20 = float(vol.tail(20).mean())
        avg5  = float(vol.tail(5).mean())

        close = hist["Close"]
        ret5d = float((close.iloc[-1] - close.iloc[-5]) / close.iloc[-5]) if len(close) >= 5 else 0.0

        if avg5 > avg20 * 1.15 and ret5d > 0.01:
            return "rising"
        if avg5 < avg20 * 0.85 and ret5d < -0.01:
            return "falling"
        return "stable"
    except Exception:
        return None


def enrich_symbol(symbol: str) -> Optional[dict]:
    try:
        ticker = yf.Ticker(symbol)
        sentiment = _news_sentiment(ticker)
        direction = _volume_trend(ticker)

        if sentiment is None and direction is None:
            return None

        return {
            "symbol": symbol,
            "news_sentiment": sentiment,
            "trends_direction": direction,
        }
    except Exception as e:
        print(f"  {symbol}: {e}", file=sys.stderr)
        return None


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

    symbols_res = db.table("politician_trade_summary").select("symbol").execute()
    symbols = list(dict.fromkeys(r["symbol"] for r in (symbols_res.data or [])))
    print(f"Enriching {len(symbols)} symbols ({MAX_WORKERS} parallel workers)")
    print("  news_sentiment : Yahoo Finance news → VADER")
    print("  trends_direction: 5d/20d volume momentum + 5d price return")

    now = datetime.now(timezone.utc).isoformat()
    results: list[dict] = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(enrich_symbol, sym): sym for sym in symbols}
        completed = 0
        for future in as_completed(futures):
            sym = futures[future]
            completed += 1
            try:
                data = future.result()
                if data:
                    results.append({**data, "sentiment_last_updated": now})
                    if completed % 20 == 0:
                        sent = f"{data['news_sentiment']:.2f}" if data["news_sentiment"] is not None else "—"
                        print(f"  [{completed}/{len(symbols)}] {sym}: sentiment={sent} trends={data['trends_direction']}")
            except Exception as e:
                print(f"  {sym}: {e}", file=sys.stderr)

    if not results:
        print("No data enriched", file=sys.stderr)
        return 1

    # Targeted UPDATE — only touch sentiment columns, leave buy_count/sell_count intact
    ok = failed = 0
    for row in results:
        try:
            db.table("politician_trade_summary").update({
                "news_sentiment":         row["news_sentiment"],
                "trends_direction":       row["trends_direction"],
                "sentiment_last_updated": row["sentiment_last_updated"],
            }).eq("symbol", row["symbol"]).execute()
            ok += 1
        except Exception as e:
            failed += 1
            print(f"  DB error for {row['symbol']}: {e}", file=sys.stderr)

    print(f"\nDone — {ok} enriched, {len(symbols) - len(results)} skipped (no data), {failed} DB errors")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
