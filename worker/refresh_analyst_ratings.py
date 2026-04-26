"""Refresh analyst buy/hold/sell recommendation consensus from Finnhub.

Fetches the most recent monthly recommendation distribution for every active
US index constituent and computes a consensus score:

    (strongBuy×2 + buy − sell − strongSell×2) / total  →  range −2..+2

Runs weekly; ratings change slowly relative to price targets.
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
DELAY = 1.2  # stay comfortably under 60 req/min free-tier limit


def fetch_recommendation(symbol: str) -> dict | None:
    try:
        r = requests.get(
            f"{BASE}/stock/recommendation",
            params={"symbol": symbol, "token": FINNHUB_TOKEN},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        return data[0] if data else None
    except Exception as e:
        print(f"  {symbol}: {e}", file=sys.stderr)
        return None


def consensus_score(rec: dict) -> float | None:
    total = sum(rec.get(k, 0) for k in ("strongBuy", "buy", "hold", "sell", "strongSell"))
    if not total:
        return None
    raw = (
        rec.get("strongBuy", 0) * 2
        + rec.get("buy", 0)
        - rec.get("sell", 0)
        - rec.get("strongSell", 0) * 2
    )
    return round(raw / total, 4)


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
    print(f"Fetching recommendation trends for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        rec = fetch_recommendation(symbol)
        time.sleep(DELAY)

        if rec is None:
            skipped += 1
            continue

        score = consensus_score(rec)
        batch.append(
            {
                "symbol": symbol,
                "strong_buy": rec.get("strongBuy", 0),
                "buy": rec.get("buy", 0),
                "hold": rec.get("hold", 0),
                "sell": rec.get("sell", 0),
                "strong_sell": rec.get("strongSell", 0),
                "consensus_score": score,
                "period": rec.get("period"),
                "updated_at": now,
            }
        )
        ok += 1

        if len(batch) >= 50:
            db.table("analyst_ratings").upsert(batch, on_conflict="symbol").execute()
            print(f"  [{i + 1}/{len(symbols)}] flushed batch of {len(batch)}")
            batch = []

    if batch:
        db.table("analyst_ratings").upsert(batch, on_conflict="symbol").execute()

    print(f"\nDone — {ok} upserted, {skipped} skipped")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
