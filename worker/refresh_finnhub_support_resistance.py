"""Refresh Finnhub support and resistance levels.

Fetches pre-calculated price levels for floor (support) and ceiling (resistance).

Signal: Safety margin. Price within 3% above major support = +1 bonus.

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
DELAY = 1.1


def fetch_support_resistance(symbol: str) -> Optional[list[float]]:
    try:
        r = requests.get(
            f"{BASE}/scan/support-resistance",
            params={"symbol": symbol, "token": FINNHUB_TOKEN, "resolution": "D"},
            timeout=15,
        )
        if r.status_code == 429:
            time.sleep(10)
            return fetch_support_resistance(symbol)
            
        r.raise_for_status()
        data = r.json()
        
        levels = data.get("levels")
        if not levels:
            return None
            
        return [float(l) for l in levels]
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
    print(f"Fetching Finnhub support/resistance for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        levels = fetch_support_resistance(symbol)
        time.sleep(DELAY)

        if levels is None:
            skipped += 1
            continue

        batch.append({"symbol": symbol, "levels": levels, "updated_at": now})
        ok += 1

        if i % 20 == 0:
            print(f"  [{i + 1}/{len(symbols)}] {symbol}: {len(levels)} levels")

        if len(batch) >= 50:
            db.table("finnhub_support_resistance").upsert(batch, on_conflict="symbol").execute()
            batch = []

    if batch:
        db.table("finnhub_support_resistance").upsert(batch, on_conflict="symbol").execute()

    print(f"\nDone — {ok} upserted, {skipped} skipped")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
