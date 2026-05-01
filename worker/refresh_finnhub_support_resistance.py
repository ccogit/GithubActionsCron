"""Refresh support and resistance levels using yfinance price history.

Replaces the Finnhub /scan/support-resistance endpoint (paid tier).
Detects swing highs and lows from 6 months of daily OHLCV data, clusters
nearby levels (within 1.5%), and returns the most significant ones.

Signal: Safety margin. Price within 3% above major support = +1 bonus.

Runs daily on weekdays. No API key required.
"""

import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

WINDOW = 5          # bars each side for local extrema
CLUSTER_PCT = 0.015 # merge levels within 1.5% of each other
MAX_LEVELS = 8      # cap returned levels


def _find_levels(symbol: str) -> Optional[list[float]]:
    try:
        hist = yf.Ticker(symbol).history(period="6mo")
        if hist.empty or len(hist) < 30:
            return None

        high = hist["High"].values
        low = hist["Low"].values

        # Local maxima and minima
        candidates: list[float] = []
        for i in range(WINDOW, len(hist) - WINDOW):
            if high[i] == max(high[i - WINDOW: i + WINDOW + 1]):
                candidates.append(float(high[i]))
            if low[i] == min(low[i - WINDOW: i + WINDOW + 1]):
                candidates.append(float(low[i]))

        if not candidates:
            return None

        # Cluster nearby levels
        candidates.sort()
        clustered: list[float] = []
        group: list[float] = [candidates[0]]

        for level in candidates[1:]:
            if level <= group[0] * (1 + CLUSTER_PCT):
                group.append(level)
            else:
                clustered.append(float(np.mean(group)))
                group = [level]
        clustered.append(float(np.mean(group)))

        # Keep levels closest to current price, capped at MAX_LEVELS
        current = float(hist["Close"].iloc[-1])
        clustered.sort(key=lambda x: abs(x - current))
        result = sorted(clustered[:MAX_LEVELS])

        return [round(l, 4) for l in result]
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
    print(f"Computing support/resistance levels for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        levels = _find_levels(symbol)
        time.sleep(0.3)

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
