"""Refresh the analyst_cache table using yfinance.

Runs in GitHub Actions hourly. Uses the yfinance Python library
which handles Yahoo Finance's anti-scraping measures properly,
giving us much better coverage for both US and German stocks.
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

# 161 symbols across Dow Jones, Nasdaq 100, DAX
SYMBOLS = [
    # Dow Jones
    "AAPL", "AMGN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS", "GS",
    "HD", "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK", "MSFT",
    "NKE", "NVDA", "PG", "SHW", "TRV", "UNH", "V", "VZ", "WBA", "WMT",
    # Nasdaq 100 (excluding overlaps)
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
    # DAX
    "ADS.DE", "AIR.DE", "ALV.DE", "BAS.DE", "BAYN.DE", "BEI.DE", "BMW.DE",
    "BNR.DE", "CBK.DE", "CON.DE", "1COV.DE", "DB1.DE", "DBK.DE", "DHER.DE",
    "DHL.DE", "DTE.DE", "DTG.DE", "ENR.DE", "EOAN.DE", "FRE.DE", "HEI.DE",
    "HEN3.DE", "HNR1.DE", "IFX.DE", "MBG.DE", "MRK.DE", "MTX.DE", "MUV2.DE",
    "P911.DE", "PAH3.DE", "PUM.DE", "QGEN.DE", "RHM.DE", "RWE.DE", "SAP.DE",
    "SHL.DE", "SIE.DE", "SRT3.DE", "SY1.DE", "VNA.DE", "VOW3.DE",
]


def get_analyst_target(symbol: str) -> Optional[dict]:
    """Fetch analyst target price from yfinance."""
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info

        target = info.get("targetMeanPrice")
        n_analysts = info.get("numberOfAnalystOpinions")
        current = info.get("currentPrice") or info.get("regularMarketPrice")

        if target and n_analysts:
            # Handle potential NaN/None values from yfinance
            try:
                target_f = float(target)
                n_analysts_i = int(n_analysts)
                current_f = float(current) if current else None
                
                # Check for NaN specifically
                if target_f != target_f or n_analysts_i != n_analysts_i:
                    return None
                    
                return {
                    "target": target_f,
                    "n_analysts": n_analysts_i,
                    "current_price": current_f,
                }
            except (ValueError, TypeError):
                return None
    except Exception as e:
        print(f"  yfinance error for {symbol}: {e}", file=sys.stderr)

    return None


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

    updated = 0
    skipped_no_target = 0
    failed = 0
    de_updated = 0

    print(f"Processing {len(SYMBOLS)} symbols via yfinance...")

    for i, symbol in enumerate(SYMBOLS):
        try:
            result = get_analyst_target(symbol)
            if not result:
                skipped_no_target += 1
                if i % 20 == 0:
                    print(f"  [{i+1}/{len(SYMBOLS)}] {symbol}: no analyst data")
                time.sleep(0.2)
                continue

            target = result["target"]
            n_analysts = result["n_analysts"]
            current_price = result.get("current_price")
            upside = ((target - current_price) / current_price) * 100 if current_price else None

            db.table("analyst_cache").upsert(
                {
                    "symbol": symbol,
                    "target_mean": target,
                    "current_price": current_price,
                    "upside_pct": upside,
                    "n_analysts": n_analysts,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                on_conflict="symbol",
            ).execute()

            updated += 1
            if symbol.endswith(".DE"):
                de_updated += 1

            if i % 10 == 0:
                price_str = f"${current_price:.2f}" if current_price else "—"
                upside_str = f"{upside:+.1f}%" if upside is not None else ""
                print(f"  [{i+1}/{len(SYMBOLS)}] {symbol}: {price_str} → ${target:.2f} {upside_str} ({n_analysts} analysts)")

            time.sleep(0.2)

        except Exception as e:
            failed += 1
            print(f"  [{i+1}/{len(SYMBOLS)}] {symbol}: error - {e}", file=sys.stderr)

    print()
    print("=" * 50)
    print(f"Updated:           {updated}")
    print(f"  US stocks:       {updated - de_updated}")
    print(f"  German (.DE):    {de_updated}")
    print(f"No analyst data:   {skipped_no_target}")
    print(f"Failed:            {failed}")
    print("=" * 50)

    return 0 if updated > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
