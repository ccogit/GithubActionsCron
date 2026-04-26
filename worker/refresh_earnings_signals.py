"""Refresh earnings beat-rate signal from yfinance earnings history.

Measures what fraction of the last 4 reported quarters the company beat
analyst EPS consensus. Consistent beaters tend to continue outperforming;
consistent misses signal execution risk. Requires at least 2 quarters of
data to generate a signal.

Runs weekly on Sundays — earnings dates update quarterly but yfinance
refreshes trailing actuals continuously.
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

MIN_QUARTERS = 2


def get_beat_rate(symbol: str) -> Optional[dict]:
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.get_earnings_dates(limit=8)
        if df is None or df.empty:
            return None

        # Drop future dates (no Reported EPS yet) and rows missing either column
        reported_col = next(
            (c for c in df.columns if "reported" in c.lower()), None
        )
        estimate_col = next(
            (c for c in df.columns if "estimate" in c.lower()), None
        )
        surprise_col = next(
            (c for c in df.columns if "surprise" in c.lower() and "%" in c), None
        )

        if reported_col is None or estimate_col is None:
            return None

        df = df.dropna(subset=[reported_col, estimate_col]).head(4)
        if len(df) < MIN_QUARTERS:
            return None

        beats = int((df[reported_col] >= df[estimate_col]).sum())
        quarters = len(df)
        beat_rate = round(beats / quarters, 4)
        avg_surprise = (
            round(float(df[surprise_col].mean()), 2)
            if surprise_col is not None
            else None
        )

        return {
            "beat_rate": beat_rate,
            "avg_surprise_pct": avg_surprise,
            "quarters_checked": quarters,
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
    print(f"Fetching earnings beat rates for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        data = get_beat_rate(symbol)
        time.sleep(0.5)

        if data is None:
            skipped += 1
            continue

        batch.append({"symbol": symbol, **data, "updated_at": now})
        ok += 1

        if i % 20 == 0:
            pct = f"{data['beat_rate'] * 100:.0f}%"
            avg = (
                f"{data['avg_surprise_pct']:+.1f}% avg surprise"
                if data.get("avg_surprise_pct") is not None
                else ""
            )
            print(f"  [{i + 1}/{len(symbols)}] {symbol}: {pct} beat rate ({data['quarters_checked']}Q) {avg}")

        if len(batch) >= 50:
            db.table("earnings_signals").upsert(batch, on_conflict="symbol").execute()
            batch = []

    if batch:
        db.table("earnings_signals").upsert(batch, on_conflict="symbol").execute()

    print(f"\nDone — {ok} upserted, {skipped} skipped")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
