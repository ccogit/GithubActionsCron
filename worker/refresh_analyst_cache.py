"""Refresh the analyst_cache table from Yahoo Finance.

Runs in GitHub Actions hourly. Bypasses the Vercel function timeout
by doing the heavy lifting directly in the runner.
"""

import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")

YAHOO_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://finance.yahoo.com",
    "Referer": "https://finance.yahoo.com/",
}

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


def get_crumb(session: requests.Session) -> Optional[str]:
    """Get Yahoo Finance crumb for authenticated requests."""
    try:
        # Initialize cookies
        session.get("https://fc.yahoo.com", headers=YAHOO_HEADERS, timeout=10)
        # Get crumb
        r = session.get(
            "https://query2.finance.yahoo.com/v1/test/getcrumb",
            headers=YAHOO_HEADERS,
            timeout=10,
        )
        if r.ok and r.text and "<" not in r.text:
            return r.text.strip()
    except Exception as e:
        print(f"Failed to get crumb: {e}", file=sys.stderr)
    return None


def get_finnhub_analyst_data(symbol: str) -> Optional[dict]:
    """Fetch analyst data from Finnhub (primarily for German stocks)."""
    if not FINNHUB_API_KEY:
        return None

    try:
        # Get recommendation trends (buy/hold/sell counts)
        url = f"https://finnhub.io/api/v1/recommendation?symbol={symbol}&token={FINNHUB_API_KEY}"
        r = requests.get(url, timeout=10)
        if r.ok:
            data = r.json()
            if isinstance(data, list) and len(data) > 0:
                rec = data[0]
                # Calculate consensus: more buys than sells = bullish, etc.
                buy_count = rec.get("buy", 0)
                hold_count = rec.get("hold", 0)
                sell_count = rec.get("sell", 0)
                strong_buy = rec.get("strongBuy", 0)
                strong_sell = rec.get("strongSell", 0)

                total = buy_count + hold_count + sell_count + strong_buy + strong_sell
                if total > 0:
                    # Calculate implied target as average of buy/strong_buy ratio
                    # Since Finnhub free tier doesn't include price targets,
                    # we return the analyst count and sentiment
                    return {
                        "n_analysts": total,
                        "sentiment": {
                            "strongBuy": strong_buy,
                            "buy": buy_count,
                            "hold": hold_count,
                            "sell": sell_count,
                            "strongSell": strong_sell,
                        },
                    }
    except Exception as e:
        print(f"  Finnhub failed for {symbol}: {e}", file=sys.stderr)

    return None


def get_analyst_target(
    session: requests.Session, symbol: str, crumb: Optional[str]
) -> Optional[dict]:
    """Fetch analyst target price from Yahoo Finance (US) or Finnhub (German stocks)."""
    clean_symbol = symbol  # Yahoo accepts .DE suffix directly

    # For German stocks (.DE), try Finnhub first
    if symbol.endswith(".DE"):
        finnhub_data = get_finnhub_analyst_data(symbol.replace(".DE", ""))
        if finnhub_data and finnhub_data.get("n_analysts"):
            return finnhub_data
        # If Finnhub doesn't have data, fall through to Yahoo as fallback
        time.sleep(0.3)

    # Try v10 quoteSummary with crumb
    if crumb:
        url = (
            f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/"
            f"{clean_symbol}?modules=financialData&crumb={crumb}"
        )
        try:
            r = session.get(url, headers=YAHOO_HEADERS, timeout=10)
            if r.ok:
                data = r.json()
                fd = (
                    data.get("quoteSummary", {})
                    .get("result", [{}])[0]
                    .get("financialData", {})
                )
                target = fd.get("targetMeanPrice", {}).get("raw")
                n = fd.get("numberOfAnalystOpinions", {}).get("raw")
                if target:
                    return {"target": target, "n_analysts": n}
        except Exception:
            pass

    # Fallback to v7 quote
    try:
        r = session.get(
            f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={clean_symbol}",
            headers=YAHOO_HEADERS,
            timeout=10,
        )
        if r.ok:
            results = r.json().get("quoteResponse", {}).get("result", [])
            if results:
                quote = results[0]
                target = quote.get("targetMeanPrice")
                n = quote.get("averageAnalystRating") and len(
                    quote.get("averageAnalystRating", "").split()
                )
                if target:
                    return {"target": target, "n_analysts": quote.get("numberOfAnalystOpinions")}
    except Exception as e:
        print(f"  v7 quote failed for {symbol}: {e}", file=sys.stderr)

    return None


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    session = requests.Session()

    print(f"Fetching crumb...")
    crumb = get_crumb(session)
    print(f"Crumb: {'obtained' if crumb else 'unavailable (using fallback)'}")

    updated = 0
    skipped_no_target = 0
    failed = 0

    print(f"Processing {len(SYMBOLS)} symbols...")

    for i, symbol in enumerate(SYMBOLS):
        try:
            result = get_analyst_target(session, symbol, crumb)
            if not result:
                skipped_no_target += 1
                if i % 20 == 0:
                    print(f"  [{i+1}/{len(SYMBOLS)}] {symbol}: no data")
                # Polite rate-limit even on miss (we still hit provider)
                time.sleep(0.3)
                continue

            target = result.get("target")
            n_analysts = result.get("n_analysts")

            # Skip if we don't have analyst count
            if not n_analysts:
                skipped_no_target += 1
                if i % 20 == 0:
                    print(f"  [{i+1}/{len(SYMBOLS)}] {symbol}: no analyst data")
                time.sleep(0.3)
                continue

            # Optional: enrich with current price from price_ticks (only present
            # for symbols in user's watchlist). The aggregator computes upside
            # against fresh quotes, so this is informational only.
            current_price = None
            upside = None

            # Only compute upside if we have a target price
            if target:
                target = float(target)
                tick_res = (
                    db.table("price_ticks")
                    .select("price")
                    .eq("symbol", symbol)
                    .order("fetched_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if tick_res.data:
                    current_price = float(tick_res.data[0]["price"])
                    upside = ((target - current_price) / current_price) * 100

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
            if i % 10 == 0:
                if target:
                    price_str = f"${current_price:.2f}" if current_price else "—"
                    upside_str = f"{upside:+.1f}%" if upside is not None else "(no live price)"
                    print(f"  [{i+1}/{len(SYMBOLS)}] {symbol}: {price_str} → ${target:.2f} {upside_str}")
                else:
                    print(f"  [{i+1}/{len(SYMBOLS)}] {symbol}: {n_analysts} analysts (sentiment data)")

            time.sleep(0.3)

        except Exception as e:
            failed += 1
            print(f"  [{i+1}/{len(SYMBOLS)}] {symbol}: error - {e}", file=sys.stderr)

    print()
    print("=" * 50)
    print(f"Updated:           {updated}")
    print(f"No analyst target: {skipped_no_target}")
    print(f"Failed:            {failed}")
    print("=" * 50)

    return 0 if updated > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
