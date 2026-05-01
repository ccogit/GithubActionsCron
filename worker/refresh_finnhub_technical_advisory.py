"""Refresh technical advisory signal using yfinance price history.

Replaces the Finnhub /scan/technical-indicator endpoint (paid tier).
Computes the same five indicators used in refresh_technical_signals.py and
maps the counts to an advisory label matching Finnhub's schema.

Signal mapping:
  buy_count >= 4 → "Strong Buy"
  buy_count == 3 → "Buy"
  sell_count >= 4 → "Strong Sell"
  sell_count == 3 → "Sell"
  otherwise       → "Neutral"

Runs daily on weekdays. No API key required.
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


def _rsi(close: pd.Series, period: int = 14) -> float:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss
    return float(100 - 100 / (1 + rs.iloc[-1]))


def _macd_histogram(close: pd.Series) -> float:
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    return float((macd - signal).iloc[-1])


def _bollinger_signal(close: pd.Series, period: int = 20) -> str:
    sma = close.rolling(period).mean()
    std = close.rolling(period).std()
    upper = sma + 2 * std
    lower = sma - 2 * std
    price = float(close.iloc[-1])
    if price > float(upper.iloc[-1]):
        return "sell"
    if price < float(lower.iloc[-1]):
        return "buy"
    return "neutral"


def _obv_signal(close: pd.Series, volume: pd.Series) -> str:
    direction = close.diff().apply(lambda x: 1 if x > 0 else -1 if x < 0 else 0)
    obv = (volume * direction).fillna(0).cumsum()
    obv_sma = obv.rolling(14).mean()
    if float(obv.iloc[-1]) > float(obv_sma.iloc[-1]):
        return "buy"
    if float(obv.iloc[-1]) < float(obv_sma.iloc[-1]):
        return "sell"
    return "neutral"


def _counts_to_advisory(buy: int, sell: int) -> str:
    if buy >= 4:
        return "Strong Buy"
    if buy == 3:
        return "Buy"
    if sell >= 4:
        return "Strong Sell"
    if sell == 3:
        return "Sell"
    return "Neutral"


def compute_advisory(symbol: str) -> Optional[dict]:
    try:
        hist = yf.Ticker(symbol).history(period="1y")
        if hist.empty or len(hist) < 50:
            return None

        close = hist["Close"]
        volume = hist["Volume"]
        current = float(close.iloc[-1])

        rsi = _rsi(close)
        rsi_sig = "buy" if rsi < 40 else "sell" if rsi > 60 else "neutral"

        sma50 = float(close.rolling(50).mean().iloc[-1])
        if len(close) >= 200:
            sma200 = float(close.rolling(200).mean().iloc[-1])
            if current > sma50 and sma50 > sma200:
                sma_sig = "buy"
            elif current < sma50 and sma50 < sma200:
                sma_sig = "sell"
            else:
                sma_sig = "neutral"
        else:
            sma_sig = "buy" if current > sma50 else "sell"

        macd_hist = _macd_histogram(close)
        macd_sig = "buy" if macd_hist > 0 else "sell"

        bb_sig = _bollinger_signal(close)
        obv_sig = _obv_signal(close, volume)

        sigs = [rsi_sig, sma_sig, macd_sig, bb_sig, obv_sig]
        buy_count = sigs.count("buy")
        sell_count = sigs.count("sell")
        neutral_count = sigs.count("neutral")

        return {
            "advisory": _counts_to_advisory(buy_count, sell_count),
            "buy_count": buy_count,
            "sell_count": sell_count,
            "neutral_count": neutral_count,
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
    symbols = list(dict.fromkeys(r["symbol"] for r in (res.data or [])))
    print(f"Computing technical advisory for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        data = compute_advisory(symbol)
        time.sleep(0.3)

        if data is None:
            skipped += 1
            continue

        batch.append({"symbol": symbol, **data, "updated_at": now})
        ok += 1

        if i % 20 == 0:
            print(f"  [{i + 1}/{len(symbols)}] {symbol}: {data['advisory']}")

        if len(batch) >= 50:
            db.table("finnhub_technical_advisory").upsert(batch, on_conflict="symbol").execute()
            batch = []

    if batch:
        db.table("finnhub_technical_advisory").upsert(batch, on_conflict="symbol").execute()

    print(f"\nDone — {ok} upserted, {skipped} skipped")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
