"""Calculate market breadth (percentage of stocks above SMA50/SMA200).

A "Healthy" market is one where the majority of stocks are participating in
a rally. If only a few mega-caps are rising while the rest of the market is
below their moving averages, the rally is fragile.

Signal: Macro context. High breadth (>70% above SMA50) is bullish.
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


def get_sma_status(symbol: str) -> tuple[bool, bool]:
    """Return (above_sma50, above_sma200)."""
    try:
        hist = yf.Ticker(symbol).history(period="1y")
        if hist.empty or len(hist) < 200:
            return False, False
        
        current = hist["Close"].iloc[-1]
        sma50 = hist["Close"].rolling(50).mean().iloc[-1]
        sma200 = hist["Close"].rolling(200).mean().iloc[-1]
        
        return (current > sma50), (current > sma200)
    except Exception:
        return False, False


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    
    # Get all active constituents grouped by exchange
    res = db.table("index_constituents").select("symbol, exchange").eq("active", True).execute()
    constituents = res.data or []
    
    by_exchange = {}
    for c in constituents:
        by_exchange.setdefault(c["exchange"], []).append(c["symbol"])
    
    now = datetime.now(timezone.utc).isoformat()
    results = []
    
    for exchange, symbols in by_exchange.items():
        print(f"Processing breadth for {exchange} ({len(symbols)} symbols)...")
        above_50 = 0
        above_200 = 0
        valid_count = 0
        
        for i, symbol in enumerate(symbols):
            s50, s200 = get_sma_status(symbol)
            if s50 or s200: # Simple heuristic: if we got any data
                if s50: above_50 += 1
                if s200: above_200 += 1
                valid_count += 1
            
            time.sleep(0.3)
            if i % 10 == 0:
                print(f"  [{i+1}/{len(symbols)}] {symbol}")
        
        if valid_count > 0:
            pct50 = round(above_50 / valid_count, 4)
            pct200 = round(above_200 / valid_count, 4)
            results.append({
                "exchange": exchange,
                "pct_above_sma50": pct50,
                "pct_above_sma200": pct200,
                "updated_at": now
            })
            print(f"  {exchange}: {pct50*100:.1f}% > SMA50, {pct200*100:.1f}% > SMA200")

    if results:
        db.table("market_breadth").upsert(results, on_conflict="exchange").execute()
    
    return 0 if results else 1


if __name__ == "__main__":
    sys.exit(main())
