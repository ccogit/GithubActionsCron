"""Refresh short interest data from yfinance (sourced from FINRA).

Short interest as a percentage of float reflects professional bearish conviction.
Stocks with >15% of float sold short face meaningful headwinds from informed
sellers. FINRA publishes settlement data biweekly; yfinance surfaces it.

Runs weekly on Sundays.
"""

import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import yfinance as yf
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]


def get_short_interest(symbol: str) -> Optional[dict]:
    try:
        info = yf.Ticker(symbol).info
        pct = info.get("shortPercentOfFloat")
        ratio = info.get("shortRatio")
        shares = info.get("sharesShort")
        if pct is None and ratio is None:
            return None
        return {
            "short_pct_float": float(pct) if pct is not None else None,
            "short_ratio": float(ratio) if ratio is not None else None,
            "shares_short": int(shares) if shares is not None else None,
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
    symbols = [r["symbol"] for r in (res.data or [])]
    print(f"Fetching short interest for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        data = get_short_interest(symbol)
        time.sleep(0.5)

        if data is None:
            skipped += 1
            continue

        batch.append({"symbol": symbol, **data, "updated_at": now})
        ok += 1

        if i % 20 == 0:
            pct_str = f"{data['short_pct_float'] * 100:.1f}%" if data.get("short_pct_float") else "—"
            ratio_str = f"{data['short_ratio']:.1f}d" if data.get("short_ratio") else "—"
            print(f"  [{i + 1}/{len(symbols)}] {symbol}: {pct_str} float, {ratio_str} to cover")

        if len(batch) >= 50:
            db.table("short_interest_cache").upsert(batch, on_conflict="symbol").execute()
            batch = []

    if batch:
        db.table("short_interest_cache").upsert(batch, on_conflict="symbol").execute()

    print(f"\nDone — {ok} upserted, {skipped} skipped")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
