"""Refresh analyst estimate revisions from yfinance.

Tracks how many analysts have revised their EPS estimates up or down in the
last 30 days. Revisions are a powerful lead indicator: when analysts raise
estimates collectively, the stock often outperforms.

Signal: rev_ratio = up / (up + down); >0.7 is bullish, <0.3 is bearish.
"""

import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
import yfinance as yf
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]


def get_analyst_revisions(symbol: str) -> Optional[dict]:
    try:
        ticker = yf.Ticker(symbol)
        # ticker.earnings_revisions is a DataFrame if available
        df = ticker.earnings_revisions
        if df is None or df.empty:
            return None

        # Structure is usually:
        #                     0Q    +1Q     0Y    +1Y
        # Up Last 7 Days      ...
        # Up Last 30 Days     ...
        # Down Last 7 Days    ...
        # Down Last 30 Days   ...

        # We focus on the current quarter (0Q) or the first column
        col = df.columns[0]
        
        up_30 = 0
        down_30 = 0
        
        if "Up Last 30 Days" in df.index:
            up_30 = int(df.loc["Up Last 30 Days", col])
        if "Down Last 30 Days" in df.index:
            down_30 = int(df.loc["Down Last 30 Days", col])

        total = up_30 + down_30
        ratio = up_30 / total if total > 0 else 0.5

        return {
            "rev_up_30d": up_30,
            "rev_down_30d": down_30,
            "rev_ratio": round(ratio, 4),
        }
    except Exception as e:
        # Many symbols (especially small caps or non-US) don't have this data
        if "Earnings Revisions" not in str(e):
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
    print(f"Fetching analyst revisions for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        data = get_analyst_revisions(symbol)
        time.sleep(0.4)

        if data is None:
            skipped += 1
            continue

        batch.append({"symbol": symbol, **data, "updated_at": now})
        ok += 1

        if i % 20 == 0:
            print(f"  [{i + 1}/{len(symbols)}] {symbol}: ratio={data['rev_ratio']} (up={data['rev_up_30d']}, down={data['rev_down_30d']})")

        if len(batch) >= 50:
            db.table("analyst_revisions").upsert(batch, on_conflict="symbol").execute()
            batch = []

    if batch:
        db.table("analyst_revisions").upsert(batch, on_conflict="symbol").execute()

    print(f"\nDone — {ok} upserted, {skipped} skipped")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
