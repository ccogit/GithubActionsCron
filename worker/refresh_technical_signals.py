"""Refresh Finnhub aggregate technical indicator signals.

Calls /scan/technical-indicator (free tier) which combines RSI, MACD, STOCH,
SMA, EMA, Bollinger Bands, and Williams %R into a single buy/neutral/sell
verdict for each symbol. Also captures ADX (trend strength).

Runs daily on weekdays after US markets close.
"""

import os
import sys
import time
from datetime import datetime, timezone

import requests
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]
FINNHUB_TOKEN = os.environ["FINNHUB_API_KEY"]

BASE = "https://finnhub.io/api/v1"
DELAY = 1.2  # 60 req/min free-tier limit


def fetch_technical(symbol: str) -> dict | None:
    try:
        r = requests.get(
            f"{BASE}/scan/technical-indicator",
            params={"symbol": symbol, "resolution": "D", "token": FINNHUB_TOKEN},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  {symbol}: {e}", file=sys.stderr)
        return None


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

    res = (
        db.table("index_constituents")
        .select("symbol")
        .eq("active", True)
        .eq("exchange_type", "us")
        .execute()
    )
    symbols = [r["symbol"] for r in (res.data or [])]
    print(f"Fetching technical signals for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        data = fetch_technical(symbol)
        time.sleep(DELAY)

        if not data:
            skipped += 1
            continue

        ta = data.get("technicalAnalysis") or {}
        trend = data.get("trend") or {}
        count = ta.get("count") or {}
        signal = ta.get("signal")

        if not signal:
            skipped += 1
            continue

        batch.append(
            {
                "symbol": symbol,
                "signal": signal,
                "buy_count": count.get("buy", 0),
                "neutral_count": count.get("neutral", 0),
                "sell_count": count.get("sell", 0),
                "adx": trend.get("adx"),
                "trending": trend.get("trending"),
                "updated_at": now,
            }
        )
        ok += 1

        if i % 20 == 0:
            print(f"  [{i + 1}/{len(symbols)}] {symbol}: {signal}")

        if len(batch) >= 50:
            db.table("technical_signals").upsert(batch, on_conflict="symbol").execute()
            print(f"  flushed batch of {len(batch)}")
            batch = []

    if batch:
        db.table("technical_signals").upsert(batch, on_conflict="symbol").execute()

    print(f"\nDone — {ok} upserted, {skipped} skipped")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
