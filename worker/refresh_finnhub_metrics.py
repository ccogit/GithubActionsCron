"""Refresh Finnhub basic financial metrics.

Fetches key ratios like P/E, Dividend Yield, and 52-Week range.

Signal: Valuation sanity. P/E < 20 = +1; Price near 52w low = +1 (Mean Reversion).

Runs weekly. Respects 60 req/min free-tier limit.
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
DELAY = 1.1


def fetch_basic_metrics(symbol: str) -> Optional[dict]:
    try:
        r = requests.get(
            f"{BASE}/stock/metric",
            params={"symbol": symbol, "token": FINNHUB_TOKEN, "metric": "all"},
            timeout=15,
        )
        if r.status_code == 429:
            time.sleep(10)
            return fetch_basic_metrics(symbol)
            
        r.raise_for_status()
        data = r.json()
        
        metrics = data.get("metric")
        if not metrics:
            return None
            
        return {
            "pe_ttm": metrics.get("peTTM"),
            "dividend_yield": metrics.get("dividendYieldIndicatedAnnual"),
            "high_52w": metrics.get("52WeekHigh"),
            "low_52w": metrics.get("52WeekLow"),
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
    print(f"Fetching Finnhub basic metrics for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        data = fetch_basic_metrics(symbol)
        time.sleep(DELAY)

        if data is None:
            skipped += 1
            continue

        batch.append({"symbol": symbol, **data, "updated_at": now})
        ok += 1

        if i % 20 == 0:
            pe = f"P/E={data['pe_ttm']}" if data.get('pe_ttm') else "no P/E"
            print(f"  [{i + 1}/{len(symbols)}] {symbol}: {pe}")

        if len(batch) >= 50:
            db.table("finnhub_metrics").upsert(batch, on_conflict="symbol").execute()
            batch = []

    if batch:
        db.table("finnhub_metrics").upsert(batch, on_conflict="symbol").execute()

    print(f"\nDone — {ok} upserted, {skipped} skipped")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
