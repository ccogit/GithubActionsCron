"""Refresh institutional and insider ownership from yfinance.

Large funds ("Smart Money") and company insiders have the most information.
High institutional ownership indicates stability, while high insider ownership
shows that management's interests are aligned with shareholders.

Signal: pct_held_institutions > 0.6 is a standard institutional benchmark.
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


def get_ownership_data(symbol: str) -> Optional[dict]:
    try:
        info = yf.Ticker(symbol).info
        inst = info.get("heldPercentInstitutions")
        insider = info.get("heldPercentInsiders")
        
        if inst is None and insider is None:
            return None
            
        return {
            "pct_held_institutions": round(float(inst or 0), 4),
            "pct_held_insiders": round(float(insider or 0), 4),
        }
    except Exception as e:
        print(f"  {symbol}: {e}", file=sys.stderr)
        return None


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    
    res = db.table("index_constituents").select("symbol").eq("active", True).eq("exchange_type", "us").execute()
    symbols = list(dict.fromkeys(r["symbol"] for r in (res.data or [])))
    
    now = datetime.now(timezone.utc).isoformat()
    batch = []
    
    print(f"Fetching ownership data for {len(symbols)} US symbols...")
    
    for i, symbol in enumerate(symbols):
        data = get_ownership_data(symbol)
        time.sleep(0.4)
        
        if data:
            batch.append({
                "symbol": symbol,
                **data,
                "updated_at": now
            })
        
        if i % 20 == 0:
            inst_pct = f"{data['pct_held_institutions']*100:.1f}%" if data else "—"
            print(f"  [{i+1}/{len(symbols)}] {symbol}: Inst={inst_pct}")
            
        if len(batch) >= 50:
            db.table("institutional_conviction").upsert(batch, on_conflict="symbol").execute()
            batch = []

    if batch:
        db.table("institutional_conviction").upsert(batch, on_conflict="symbol").execute()
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
