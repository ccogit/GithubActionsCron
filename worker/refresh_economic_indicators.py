"""Fetch major US economic indicators from FRED (Federal Reserve Economic Data).

Tracks indicators that affect market sentiment:
  - Fed Funds Rate (DFF): Rising rates = headwind for growth stocks
  - Unemployment Rate (UNRATE): Rising unemployment = economic slowdown
  - Consumer Price Index (CPIAUCSL): Inflation signal; CPI change YoY

Updates daily (though FRED data updates with a lag).

Requires FRED_API_KEY environment variable (free tier from https://fredaccount.stlouisfed.org).
"""

import os
import sys
from datetime import datetime, timezone
import urllib.request
import json
from typing import Optional

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]
FRED_API_KEY = os.environ.get("FRED_API_KEY", "")

FRED_BASE = "https://api.stlouisfed.org/fred/series"

INDICATORS = {
    "DFF": "Fed Funds Rate (%)",
    "UNRATE": "Unemployment Rate (%)",
    "CPIAUCSL": "Consumer Price Index",
}


def fetch_fred_series(series_id: str, limit: int = 1) -> Optional[dict]:
    """Fetch latest value from FRED API."""
    if not FRED_API_KEY:
        print(f"  FRED_API_KEY not set — skipping {series_id}", file=sys.stderr)
        return None

    try:
        url = f"{FRED_BASE}/{series_id}/observations?api_key={FRED_API_KEY}&limit={limit}&sort_order=desc"
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode())
            if data.get("observations"):
                obs = data["observations"][0]
                value_str = obs.get("value")
                if value_str and value_str != ".":
                    return {
                        "date": obs["date"],
                        "value": float(value_str),
                    }
        return None
    except Exception as e:
        print(f"  {series_id}: {e}", file=sys.stderr)
        return None


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    now = datetime.now(timezone.utc).isoformat()

    print("Fetching economic indicators from FRED...")

    batch: list[dict] = []
    ok = 0

    for series_id, label in INDICATORS.items():
        data = fetch_fred_series(series_id)
        if data is None:
            print(f"  {series_id}: no data")
            continue

        batch.append({
            "indicator": series_id,
            "label": label,
            "value": data["value"],
            "observation_date": data["date"],
            "fetched_at": now,
        })
        ok += 1
        print(f"  {series_id} ({label}): {data['value']} as of {data['date']}")

    if batch:
        db.table("economic_indicators").upsert(batch, on_conflict="indicator").execute()
        print(f"\nStored {len(batch)} indicators")

    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
