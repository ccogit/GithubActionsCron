"""Refresh market volatility (VIX) from yfinance.

The VIX ("Fear Gauge") measures market expectations of near-term volatility.
High VIX (>30) indicates extreme fear and usually correlates with market bottoms.
Low VIX (<15) indicates complacency and can precede market tops.

Signal: Macro context. VIX > 30 is a "dampener" for growth attractiveness.
"""

import os
import sys
from datetime import datetime, timezone
from typing import Optional

import yfinance as yf
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]


def get_vix_level() -> Optional[float]:
    try:
        ticker = yf.Ticker("^VIX")
        hist = ticker.history(period="1d")
        if hist.empty:
            return None
        return float(hist["Close"].iloc[-1])
    except Exception as e:
        print(f"  VIX error: {e}", file=sys.stderr)
        return None


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    
    vix = get_vix_level()
    if vix is None:
        return 1
        
    now = datetime.now(timezone.utc).isoformat()
    
    db.table("market_volatility").upsert({
        "indicator": "VIX",
        "value": round(vix, 2),
        "updated_at": now
    }, on_conflict="indicator").execute()
    
    print(f"VIX level updated: {vix:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
