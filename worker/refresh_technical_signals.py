"""Refresh composite technical indicator signals using yfinance price history.

Computes three indicators from daily OHLCV data and combines them into a
single buy/neutral/sell verdict:

  1. RSI(14)       — oversold (<40) = bullish, overbought (>60) = bearish
  2. SMA crossover — price > SMA50 > SMA200 = bullish; inverted = bearish
  3. MACD histogram — positive = bullish, negative = bearish

Signal: 2 of 3 indicators agree → buy or sell; otherwise neutral.

Runs daily on weekdays after market close. No API key required.
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


def get_technical_signal(symbol: str) -> Optional[dict]:
    try:
        hist = yf.Ticker(symbol).history(period="1y")
        if hist.empty or len(hist) < 50:
            return None

        close = hist["Close"]
        current = float(close.iloc[-1])

        # 1. RSI
        rsi = _rsi(close)
        rsi_sig = "buy" if rsi < 40 else "sell" if rsi > 60 else "neutral"

        # 2. SMA crossover
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

        # 3. MACD histogram
        macd_hist = _macd_histogram(close)
        macd_sig = "buy" if macd_hist > 0 else "sell"

        signals = [rsi_sig, sma_sig, macd_sig]
        buy_count = signals.count("buy")
        sell_count = signals.count("sell")
        neutral_count = signals.count("neutral")

        if buy_count >= 2:
            signal = "buy"
        elif sell_count >= 2:
            signal = "sell"
        else:
            signal = "neutral"

        return {
            "signal": signal,
            "buy_count": buy_count,
            "neutral_count": neutral_count,
            "sell_count": sell_count,
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
    print(f"Computing technical signals for {len(symbols)} US symbols...")

    now = datetime.now(timezone.utc).isoformat()
    batch: list[dict] = []
    ok = skipped = 0

    for i, symbol in enumerate(symbols):
        data = get_technical_signal(symbol)
        time.sleep(0.3)

        if data is None:
            skipped += 1
            continue

        batch.append({"symbol": symbol, **data, "updated_at": now})
        ok += 1

        if i % 20 == 0:
            print(f"  [{i + 1}/{len(symbols)}] {symbol}: {data['signal']}")

        if len(batch) >= 50:
            db.table("technical_signals").upsert(batch, on_conflict="symbol").execute()
            print(f"  flushed batch of {len(batch)}")
            batch = []

    if batch:
        db.table("technical_signals").upsert(batch, on_conflict="symbol").execute()

    print(f"\nDone — {ok} upserted, {skipped} skipped")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
