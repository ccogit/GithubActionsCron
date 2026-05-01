"""Refresh basic financial metrics using yfinance.

Replaces the Finnhub /stock/metric endpoint.
Fetches P/E TTM, dividend yield, and 52-week range from yfinance ticker.info.

Signal: Valuation sanity. P/E < 20 = +1; Price near 52w low = +1 (Mean Reversion).

Runs weekly. No API key required.
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


def fetch_basic_metrics(symbol: str) -> Optional[dict]:
    try:
        info = yf.Ticker(symbol).info
        if not info:
            return None

        pe = info.get("trailingPE")
        div_yield = info.get("dividendYield")
        high_52w = info.get("fiftyTwoWeekHigh")
        low_52w = info.get("fiftyTwoWeekLow")

        # At least one meaningful value must be present
        if pe is None and high_52w is None and low_52w is None:
            return None

        return {
            "pe_ttm": float(pe) if pe is not None else None,
            "dividend_yield": float(div_yield) if div_yield is not None else None,
            "high_52w": float(high_52w) if high_52w is not None else None,
            "low_52w": float(low_52w) if low_52w is not None else None,
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
    print(f"Fetching basic metrics for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        data = fetch_basic_metrics(symbol)
        time.sleep(0.4)

        if data is None:
            skipped += 1
            continue

        batch.append({"symbol": symbol, **data, "updated_at": now})
        ok += 1

        if i % 20 == 0:
            pe = f"P/E={data['pe_ttm']:.1f}" if data.get("pe_ttm") else "no P/E"
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
