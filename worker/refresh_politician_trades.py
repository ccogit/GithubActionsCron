"""Refresh politician trades from AInvest API.

Runs daily via GitHub Actions. Fetches congressional stock trades
and aggregates them by symbol for display in Market Overview.
"""

import os
import sys
import time
from datetime import datetime, timezone
from collections import defaultdict
from typing import Optional

import requests
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]
AINVEST_TOKEN = os.environ.get("AINVEST_API_KEY", "")

# 161 symbols
SYMBOLS = [
    # Dow Jones
    "AAPL", "AMGN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS", "GS",
    "HD", "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK", "MSFT",
    "NKE", "NVDA", "PG", "SHW", "TRV", "UNH", "V", "VZ", "WBA", "WMT",
    # Nasdaq 100
    "AMZN", "META", "GOOGL", "GOOG", "TSLA", "AVGO", "COST", "NFLX", "AMD",
    "QCOM", "ADBE", "PEP", "INTU", "INTC", "TXN", "AMAT", "PANW", "ISRG",
    "BKNG", "MU", "ADI", "GILD", "VRTX", "SBUX", "MDLZ", "LRCX", "REGN",
    "KLAC", "ADP", "PYPL", "MELI", "PDD", "SNPS", "MAR", "CDNS", "ORLY",
    "FTNT", "WDAY", "CSX", "ROP", "MRVL", "DASH", "MNST", "PCAR", "ABNB",
    "PAYX", "AEP", "AZN", "ADSK", "FANG", "CTAS", "ROST", "CHTR", "EXC",
    "DDOG", "TEAM", "BKR", "CPRT", "FAST", "ODFL", "GEHC", "KHC", "CCEP",
    "EA", "VRSK", "CTSH", "XEL", "DLTR", "IDXX", "BIIB", "ANSS", "CSGP",
    "ON", "GFS", "TTD", "DXCM", "ZS", "ARM", "WBD", "ENPH", "ZM", "MRNA",
    "ILMN", "CRWD", "CDW", "CEG", "SIRI", "NXPI", "LIN", "CMCSA",
    # DAX - only US politicians trade these, skip for now
]


def parse_reporting_gap(gap_str: Optional[str]) -> Optional[int]:
    """Extract integer days from reporting gap string like '15 Days'."""
    if not gap_str:
        return None
    try:
        return int(gap_str.split()[0])
    except (IndexError, ValueError):
        return None


def fetch_trades(symbol: str) -> list:
    """Fetch politician trades for a symbol from AInvest."""
    try:
        url = f"https://openapi.ainvest.com/open/ownership/congress?ticker={symbol}"
        headers = {"Authorization": f"Bearer {AINVEST_TOKEN}"}
        r = requests.get(url, headers=headers, timeout=10)

        if r.status_code != 200:
            return []

        data = r.json()
        if data.get("status_code") != 0:
            return []

        trades = data.get("data", {}).get("data", [])
        return [
            {
                **trade,
                "symbol": symbol,
                "trade_date": trade.get("trade_date"),
                "filing_date": trade.get("filing_date"),
                "reporting_gap": parse_reporting_gap(trade.get("reporting_gap")),
            }
            for trade in trades
        ]

    except Exception as e:
        print(f"  Error fetching {symbol}: {e}", file=sys.stderr)
        return []


def aggregate_trades(trades_by_symbol: dict) -> dict:
    """Aggregate trades into summary statistics."""
    summary = {}

    for symbol, trades in trades_by_symbol.items():
        if not trades:
            continue

        buy_trades = [t for t in trades if t.get("trade_type") == "buy"]
        sell_trades = [t for t in trades if t.get("trade_type") == "sell"]

        buy_count = len(buy_trades)
        sell_count = len(sell_trades)
        total = buy_count + sell_count

        # Top buyers/sellers
        buyer_names = defaultdict(int)
        seller_names = defaultdict(int)

        for trade in buy_trades:
            buyer_names[trade.get("name")] += 1
        for trade in sell_trades:
            seller_names[trade.get("name")] += 1

        top_buyers = sorted(
            [{"name": k, "count": v} for k, v in buyer_names.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:3]

        top_sellers = sorted(
            [{"name": k, "count": v} for k, v in seller_names.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:3]

        buy_ratio = buy_count / total if total > 0 else 0

        summary[symbol] = {
            "buy_count": buy_count,
            "sell_count": sell_count,
            "buy_ratio": buy_ratio,
            "top_buyers": top_buyers,
            "top_sellers": top_sellers,
            "last_7_days": sorted(trades, key=lambda t: t.get("trade_date", ""), reverse=True)[:7],
        }

    return summary


def main() -> int:
    if not AINVEST_TOKEN:
        print("ERROR: AINVEST_API_KEY not set", file=sys.stderr)
        return 1

    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

    print(f"Fetching politician trades for {len(SYMBOLS)} symbols...")
    trades_by_symbol = {}
    fetched = 0
    skipped = 0

    for i, symbol in enumerate(SYMBOLS):
        trades = fetch_trades(symbol)
        if trades:
            trades_by_symbol[symbol] = trades
            fetched += 1
            if i % 20 == 0:
                print(f"  [{i+1}/{len(SYMBOLS)}] {symbol}: {len(trades)} trades")
        else:
            skipped += 1

        time.sleep(0.5)  # Rate limit

    print(f"\nAggregating data...")
    summary = aggregate_trades(trades_by_symbol)

    # Store trades and summary
    inserted = 0
    for symbol, trades in trades_by_symbol.items():
        for trade in trades:
            try:
                db.table("politician_trades").upsert(
                    {
                        "id": trade.get("id"),
                        "symbol": symbol,
                        "name": trade.get("name"),
                        "trade_type": trade.get("trade_type"),
                        "trade_date": trade.get("trade_date"),
                        "filing_date": trade.get("filing_date"),
                        "size": trade.get("size"),
                        "state": trade.get("state"),
                        "party": trade.get("party"),
                        "reporting_gap": trade.get("reporting_gap"),
                    },
                    on_conflict="id,symbol",
                ).execute()
                inserted += 1
            except Exception as e:
                print(f"  Error storing trade {trade.get('id')}: {e}", file=sys.stderr)

    # Update summary
    for symbol, data in summary.items():
        try:
            db.table("politician_trade_summary").upsert(
                {
                    "symbol": symbol,
                    "buy_count": data["buy_count"],
                    "sell_count": data["sell_count"],
                    "buy_ratio": float(data["buy_ratio"]),
                    "top_buyers": data["top_buyers"],
                    "top_sellers": data["top_sellers"],
                    "last_7_days": str(data["last_7_days"]),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                on_conflict="symbol",
            ).execute()
        except Exception as e:
            print(f"  Error updating summary for {symbol}: {e}", file=sys.stderr)

    print()
    print("=" * 50)
    print(f"Symbols fetched: {fetched}")
    print(f"Symbols skipped: {skipped}")
    print(f"Trades stored:  {inserted}")
    print(f"Summary rows:   {len(summary)}")
    print("=" * 50)

    return 0 if inserted > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
