"""Refresh corporate insider transaction signals from yfinance (SEC Form 4).

Aggregates open-market purchases and sales by officers and directors over
the trailing 90 days. Option exercises, RSU releases, and automatic 10b5-1
sales are excluded — only discretionary transactions count. Executives buying
their own stock with personal funds is historically one of the strongest
bullish signals.

Signal logic (last 90 days):
  buying  — ≥2 open-market purchases AND buys > sells
  selling — ≥3 open-market sales AND sells ≥ 2× buys
  neutral — everything else

Runs daily on weekdays; Form 4 filings arrive within 2 business days.
"""

import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
import yfinance as yf
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

LOOKBACK_DAYS = 90


def _col(df: pd.DataFrame, *candidates: str) -> Optional[str]:
    """Return the first column name that matches any candidate substring."""
    cols = [c.lower() for c in df.columns]
    for cand in candidates:
        for i, c in enumerate(cols):
            if cand in c:
                return df.columns[i]
    return None


def get_insider_signal(symbol: str) -> Optional[dict]:
    try:
        txns = yf.Ticker(symbol).insider_transactions
        if txns is None or txns.empty:
            return None

        date_col = _col(txns, "date")
        text_col = _col(txns, "text", "transaction", "type")
        shares_col = _col(txns, "shares")

        if date_col is None or text_col is None:
            return None

        txns = txns.copy()
        txns[date_col] = pd.to_datetime(txns[date_col], errors="coerce", utc=True)
        cutoff = pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=LOOKBACK_DAYS)
        recent = txns[txns[date_col] >= cutoff]

        if recent.empty:
            return None

        texts = recent[text_col].fillna("").astype(str).str.lower()
        is_buy = texts.str.contains("purchase", na=False)
        # Exclude automatic 10b5-1 plan sales; include regular open-market sales
        is_sell = texts.str.contains(r"sale|sold", na=False) & ~texts.str.contains(
            "automatic|10b5", na=False
        )

        buys = recent[is_buy]
        sells = recent[is_sell]
        buy_count = len(buys)
        sell_count = len(sells)

        net_shares = 0
        if shares_col is not None:
            net_shares = int(
                pd.to_numeric(buys[shares_col], errors="coerce").fillna(0).sum()
                - pd.to_numeric(sells[shares_col], errors="coerce").fillna(0).sum()
            )

        if buy_count >= 2 and buy_count > sell_count:
            signal = "buying"
        elif sell_count >= 3 and sell_count >= buy_count * 2:
            signal = "selling"
        else:
            signal = "neutral"

        return {
            "buy_count": buy_count,
            "sell_count": sell_count,
            "net_shares": net_shares,
            "signal": signal,
        }
    except Exception as e:
        print(f"  {symbol}: {e}", file=sys.stderr)
        return None


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

    res = (
        db.table("index_constituents")
        .select("symbol")
        .eq("active", True)
        .eq("exchange_type", "us")
        .execute()
    )
    symbols = [r["symbol"] for r in (res.data or [])]
    print(f"Fetching insider transactions for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        data = get_insider_signal(symbol)
        time.sleep(0.5)

        if data is None:
            skipped += 1
            continue

        batch.append({"symbol": symbol, **data, "updated_at": now})
        ok += 1

        if i % 20 == 0:
            print(
                f"  [{i + 1}/{len(symbols)}] {symbol}: {data['signal']}"
                f" (buys={data['buy_count']}, sells={data['sell_count']})"
            )

        if len(batch) >= 50:
            db.table("insider_signals").upsert(batch, on_conflict="symbol").execute()
            batch = []

    if batch:
        db.table("insider_signals").upsert(batch, on_conflict="symbol").execute()

    print(f"\nDone — {ok} upserted, {skipped} skipped")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
