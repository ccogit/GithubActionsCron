"""Detect unusual options volume using yfinance.

Runs daily after market close. Uses yfinance (free, no API key) to fetch
options chain for each symbol and flag contracts where volume exceeds
open interest — the standard definition of "unusual" options activity.

Stores aggregated unusual volume and call/put ratio per symbol.
"""

import os
import sys
import time
import math
import pandas as pd
import yfinance as yf
from datetime import datetime, timezone
from typing import Optional

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

# Reuse your existing universe — keep in sync with refresh_analyst_cache.py
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
    # DAX — options data via yfinance may be limited for .DE tickers
    "ADS.DE", "AIR.DE", "ALV.DE", "BAS.DE", "BAYN.DE", "BEI.DE", "BMW.DE",
    "BNR.DE", "CBK.DE", "CON.DE", "1COV.DE", "DB1.DE", "DBK.DE", "DHER.DE",
    "DHL.DE", "DTE.DE", "DTG.DE", "ENR.DE", "EOAN.DE", "FRE.DE", "HEI.DE",
    "HEN3.DE", "HNR1.DE", "IFX.DE", "MBG.DE", "MRK.DE", "MTX.DE", "MUV2.DE",
    "P911.DE", "PAH3.DE", "PUM.DE", "QGEN.DE", "RHM.DE", "RWE.DE", "SAP.DE",
    "SHL.DE", "SIE.DE", "SRT3.DE", "SY1.DE", "VNA.DE", "VOW3.DE",
]

MIN_UNUSUAL_CONTRACTS = 5       # only flag if at least this many contracts are unusual
VOLUME_OI_RATIO_THRESHOLD = 2.0  # volume must be at least 2× open interest


def get_options_flow(symbol: str) -> Optional[dict]:
    """Fetch options chain and calculate unusual volume metrics per symbol.

    For each available expiration date, fetches the call and put chains,
    flags individual contracts where volume > open_interest * threshold,
    and aggregates: total unusual contracts, call vs. put breakdown,
    and a simple call/put skew ratio.
    """
    try:
        ticker = yf.Ticker(symbol)
        expirations = ticker.options
        if not expirations:
            return None

        unusual_calls = 0
        unusual_puts = 0
        total_unusual_volume = 0
        total_contracts_checked = 0

        # Limit to nearest 4 expirations to stay within rate limits
        for exp_date in expirations[:4]:
            try:
                chain = ticker.option_chain(exp_date)
            except Exception:
                continue

            for opt_type, df in [("call", chain.calls), ("put", chain.puts)]:
                for _, row in df.iterrows():
                    # Handle NaN values which cause int() to fail
                    raw_vol = row.get("volume", 0)
                    raw_oi = row.get("openInterest", 0)
                    
                    vol = int(raw_vol) if not pd.isna(raw_vol) else 0
                    oi = int(raw_oi) if not pd.isna(raw_oi) else 0

                    if oi <= 0 or vol <= 0:
                        continue
                    total_contracts_checked += 1
                    if vol >= oi * VOLUME_OI_RATIO_THRESHOLD:
                        total_unusual_volume += vol
                        if opt_type == "call":
                            unusual_calls += 1
                        else:
                            unusual_puts += 1

        total_unusual = unusual_calls + unusual_puts
        if total_unusual < MIN_UNUSUAL_CONTRACTS:
            return None

        # Call/put skew: positive = more call activity, negative = more puts
        call_put_ratio = (
            (unusual_calls - unusual_puts) / total_unusual
            if total_unusual > 0
            else 0.0
        )

        return {
            "unusual_contracts": total_unusual,
            "unusual_calls": unusual_calls,
            "unusual_puts": unusual_puts,
            "call_put_skew": round(call_put_ratio, 3),
            "total_volume_unusual": total_unusual_volume,
            "contracts_checked": total_contracts_checked,
        }

    except Exception as e:
        print(f"  yfinance options error for {symbol}: {e}", file=sys.stderr)
        return None


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    now = datetime.now(timezone.utc).isoformat()

    print(f"Refreshing options flow for {len(SYMBOLS)} symbols via yfinance...")

    updated = 0
    skipped_no_options = 0
    skipped_no_unusual = 0
    failed = 0

    for i, symbol in enumerate(SYMBOLS):
        try:
            data = get_options_flow(symbol)

            if data is None:
                # Could be no options market or no unusual activity
                skipped_no_options += 1
                if i % 20 == 0:
                    print(f"  [{i+1}/{len(SYMBOLS)}] {symbol}: no unusual options activity")
                time.sleep(0.3)
                continue

            db.table("options_flow").upsert(
                {
                    "symbol": symbol,
                    "unusual_contracts": data["unusual_contracts"],
                    "unusual_calls": data["unusual_calls"],
                    "unusual_puts": data["unusual_puts"],
                    "call_put_skew": data["call_put_skew"],
                    "total_volume_unusual": data["total_volume_unusual"],
                    "updated_at": now,
                },
                on_conflict="symbol",
            ).execute()

            updated += 1
            if data["unusual_contracts"] >= 20 or i % 20 == 0:
                print(
                    f"  [{i+1}/{len(SYMBOLS)}] {symbol}: "
                    f"{data['unusual_contracts']} unusual "
                    f"(C:{data['unusual_calls']} P:{data['unusual_puts']})"
                )

            time.sleep(0.3)

        except Exception as e:
            failed += 1
            print(f"  [{i+1}/{len(SYMBOLS)}] {symbol}: error — {e}", file=sys.stderr)

    print()
    print("=" * 50)
    print(f"Updated (unusual activity):    {updated}")
    print(f"No unusual activity detected:  {skipped_no_options}")
    print(f"Failed:                        {failed}")
    print("=" * 50)

    return 0 if updated > 0 else 1


if __name__ == "__main__":
    sys.exit(main())