"""Refresh Finnhub technical advisory summary.

Aggregates multiple technical indicators (RSI, MACD, Moving Averages) from
Finnhub's proprietary scanner to provide a single 'Advisory' signal.

Signal: 'Strong Buy' = +1; 'Strong Sell' = -1.

Runs daily on weekdays. Respects 60 req/min free-tier limit.
"""

import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]
FINNHUB_TOKEN = os.environ["FINNHUB_API_KEY"]

BASE = "https://finnhub.io/api/v1"
DELAY = 1.1  # stay under 60 req/min


def fetch_technical_advisory(symbol: str) -> Optional[dict]:
    try:
        r = requests.get(
            f"{BASE}/scan/technical-indicator",
            params={"symbol": symbol, "token": FINNHUB_TOKEN, "resolution": "D"},
            timeout=15,
        )
        if r.status_code == 429:
            print("  Rate limit hit, sleeping...", file=sys.stderr)
            time.sleep(10)
            return fetch_technical_advisory(symbol)
            
        r.raise_for_status()
        data = r.json()
        
        trend = data.get("trend")
        if not trend:
            return None
            
        return {
            "advisory": trend.get("advisory"),
            "buy_count": int(trend.get("buy", 0)),
            "sell_count": int(trend.get("sell", 0)),
            "neutral_count": int(trend.get("neutral", 0)),
        }
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
    symbols = list(dict.fromkeys(r["symbol"] for r in (res.data or [])))
    print(f"Fetching Finnhub technical advisory for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        data = fetch_technical_advisory(symbol)
        time.sleep(DELAY)

        if data is None:
            skipped += 1
            continue

        batch.append({"symbol": symbol, **data, "updated_at": now})
        ok += 1

        if i % 20 == 0:
            print(f"  [{i + 1}/{len(symbols)}] {symbol}: {data['advisory']}")

        if len(batch) >= 50:
            db.table("finnhub_technical_advisory").upsert(batch, on_conflict="symbol").execute()
            batch = []

    if batch:
        db.table("finnhub_technical_advisory").upsert(batch, on_conflict="symbol").execute()

    print(f"\nDone — {ok} upserted, {skipped} skipped")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
