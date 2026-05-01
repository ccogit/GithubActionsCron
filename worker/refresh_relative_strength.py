"""Calculate relative strength vs. benchmark (SPY for US, DAX for DE).

Stocks that outperform their benchmark during market corrections are the true
leaders. Buying "Relative Strength" is a core momentum strategy.

Signal: rs_3m > 0 indicates outperformance over the last 3 months.
"""

import os
import sys
import time
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

BENCHMARKS = {
    "us": "SPY",
    "de": "^GDAXI"
}


def get_relative_strength(symbol: str, benchmark_df: pd.DataFrame) -> tuple[float, float]:
    try:
        hist = yf.Ticker(symbol).history(period="1y")
        if hist.empty or len(hist) < 130: # ~6 months
            return 0.0, 0.0
        
        # Align dates
        combined = pd.concat([hist["Close"], benchmark_df["Close"]], axis=1, keys=["stock", "bench"]).dropna()
        
        # Calculate returns
        def get_rs(days: int) -> float:
            if len(combined) < days: return 0.0
            stock_ret = (combined["stock"].iloc[-1] / combined["stock"].iloc[-days]) - 1
            bench_ret = (combined["bench"].iloc[-1] / combined["bench"].iloc[-days]) - 1
            return (stock_ret - bench_ret) * 100

        return round(get_rs(63), 2), round(get_rs(126), 2) # ~3m and ~6m
    except Exception:
        return 0.0, 0.0


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    
    # Fetch benchmarks first
    bench_data = {
        k: yf.Ticker(v).history(period="1y") for k, v in BENCHMARKS.items()
    }
    
    res = db.table("index_constituents").select("symbol, exchange_type").eq("active", True).execute()
    
    # De-duplicate symbols while preserving exchange_type
    unique_map = {}
    for r in (res.data or []):
        unique_map[r["symbol"]] = r["exchange_type"]
    
    unique_constituents = [{"symbol": s, "exchange_type": et} for s, et in unique_map.items()]
    
    now = datetime.now(timezone.utc).isoformat()
    batch = []
    
    print(f"Calculating relative strength for {len(unique_constituents)} symbols...")
    
    for i, c in enumerate(unique_constituents):
        symbol = c["symbol"]
        etype = c["exchange_type"]
        bench_df = bench_data.get(etype)
        
        if bench_df is None: continue
        
        rs3, rs6 = get_relative_strength(symbol, bench_df)
        if rs3 != 0 or rs6 != 0:
            batch.append({
                "symbol": symbol,
                "rs_3m": rs3,
                "rs_6m": rs6,
                "updated_at": now
            })
        
        time.sleep(0.3)
        if i % 20 == 0:
            print(f"  [{i+1}/{len(unique_constituents)}] {symbol}: RS3={rs3}%")
            
        if len(batch) >= 50:
            db.table("relative_strength").upsert(batch, on_conflict="symbol").execute()
            batch = []

    if batch:
        db.table("relative_strength").upsert(batch, on_conflict="symbol").execute()
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
