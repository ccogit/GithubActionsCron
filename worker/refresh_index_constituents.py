"""Refresh the index_constituents table from Wikipedia.

Scrapes Dow Jones, Nasdaq 100, and DAX constituent lists from Wikipedia
and upserts them into the index_constituents table. Runs weekly.
"""

import os
import pandas as pd
import requests
import sys
from datetime import datetime, timezone
from io import StringIO

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

SOURCES = [
    {
        "exchange": "Dow Jones",
        "url": "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average",
        "symbol_col": "Symbol",
        "name_col": "Company",
        "exchange_type": "us",
        "symbol_suffix": "",
    },
    {
        "exchange": "Nasdaq 100",
        "url": "https://en.wikipedia.org/wiki/Nasdaq-100",
        "symbol_col": "Ticker",
        "name_col": "Company",
        "exchange_type": "us",
        "symbol_suffix": "",
    },
    {
        "exchange": "DAX",
        "url": "https://en.wikipedia.org/wiki/DAX",
        "symbol_col": "Ticker",
        "name_col": "Company",
        "exchange_type": "de",
        "symbol_suffix": ".DE",
    },
]


def fetch_constituents(source: dict) -> list[dict]:
    """Fetch and parse constituent list from a Wikipedia page."""
    url = source["url"]
    symbol_col = source["symbol_col"]
    name_col = source["name_col"]
    suffix = source["symbol_suffix"]

    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()

    # pandas 2.x requires a file-like object for raw HTML strings — passing
    # resp.text directly makes pandas try to open it as a file path.
    tables = pd.read_html(StringIO(resp.text), match=symbol_col)
    if not tables:
        raise ValueError(f"No table matching '{symbol_col}' found at {url}")

    df = tables[0]

    if symbol_col not in df.columns or name_col not in df.columns:
        raise ValueError(
            f"Expected columns '{symbol_col}' and '{name_col}', got: {df.columns.tolist()}"
        )

    rows = []
    for _, row in df.iterrows():
        symbol = str(row[symbol_col]).strip()
        name = str(row[name_col]).strip()

        if not symbol or symbol.lower() in ("nan", symbol_col.lower()):
            continue

        # DAX tickers on Wikipedia have no .DE suffix; Yahoo Finance requires it
        if suffix and not symbol.endswith(suffix):
            symbol = f"{symbol}{suffix}"

        rows.append({"symbol": symbol, "name": name})

    return rows


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    now = datetime.now(timezone.utc).isoformat()
    total = 0

    for source in SOURCES:
        exchange = source["exchange"]
        print(f"\n{exchange}...")
        try:
            constituents = fetch_constituents(source)
            print(f"  Scraped {len(constituents)} symbols")

            if not constituents:
                print("  WARNING: empty result, skipping", file=sys.stderr)
                continue

            # Mark all existing rows for this exchange as inactive, then upsert
            # the current list as active. Removed symbols stay inactive.
            db.table("index_constituents").update(
                {"active": False, "updated_at": now}
            ).eq("exchange", exchange).execute()

            rows = [
                {
                    "symbol": c["symbol"],
                    "name": c["name"],
                    "exchange": exchange,
                    "exchange_type": source["exchange_type"],
                    "active": True,
                    "updated_at": now,
                }
                for c in constituents
            ]

            db.table("index_constituents").upsert(
                rows, on_conflict="symbol,exchange"
            ).execute()

            total += len(constituents)
            print(f"  OK — {len(constituents)} upserted")

        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)

    print(f"\nTotal upserted: {total}")
    return 0 if total > 0 else 1


if __name__ == "__main__":
    sys.exit(main())