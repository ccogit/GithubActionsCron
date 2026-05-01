"""Intraday attractiveness score — technical/momentum signals only.

Completely separate from the main portfolio's daily score (computeAttractiveness
in attractiveness.ts), which uses fundamental, news, and congressional-trade signals.

This module uses only live intraday market data so it can re-score stocks
every minute during the trading session.

Signals (each ±1, one can contribute +2):
  1. VWAP position   — price above/below session VWAP
  2. RSI(14) 5-min   — momentum zone check
  3. Volume activity — current bar vs session average
  4. Bar momentum    — net change over last 5 bars
  5. Daily change    — today's open-to-current vs yesterday's close
  6. 20-day breakout — price above 20-day high (daily bars)

Score range: −5 to +6.
  ≥ 2  → strong enough to consider for portfolio deployment
  ≥ 1  → minimum for strategy-specific entries
  < 0  → bearish intraday conditions; exit or avoid
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# RSI helper (exported — used by intraday_mean_reversion too)
# ---------------------------------------------------------------------------

def rsi(bars: list[dict], period: int = 14) -> float | None:
    """Wilder RSI from bar closes. Returns None if insufficient data."""
    closes = [float(b["c"]) for b in bars]
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(d,  0.0) for d in deltas]
    losses = [max(-d, 0.0) for d in deltas]
    avg_gain = sum(gains[:period])  / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i])  / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    return 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)


# ---------------------------------------------------------------------------
# VWAP helper (duplicated from intraday_shared to keep this module standalone)
# ---------------------------------------------------------------------------

def _vwap(bars: list[dict]) -> float:
    cum_tpv = cum_v = 0.0
    for b in bars:
        tp = (b["h"] + b["l"] + b["c"]) / 3.0
        v  = float(b.get("v", 0))
        cum_tpv += tp * v
        cum_v   += v
    return cum_tpv / cum_v if cum_v > 0 else 0.0


# ---------------------------------------------------------------------------
# Main scoring function
# ---------------------------------------------------------------------------

def compute_intraday_score(
    bars_5min: list[dict],
    daily_bars: list[dict] | None = None,
) -> dict:
    """
    Score a stock for intraday trading based entirely on live market data.

    Parameters
    ----------
    bars_5min   Today's 5-minute OHLCV bars (chronological, oldest first).
    daily_bars  Recent daily OHLCV bars. Optional; enables signals 5 and 6.

    Returns
    -------
    dict with keys: score (int), price (float), signals (list), enough_data (bool)
    """
    if not bars_5min:
        return {"score": 0, "price": 0.0, "signals": [], "enough_data": False}

    price   = float(bars_5min[-1]["c"])
    score   = 0
    signals: list[dict] = []

    # -----------------------------------------------------------------------
    # Signal 1: VWAP position
    # -----------------------------------------------------------------------
    vwap_val = _vwap(bars_5min)
    if vwap_val > 0:
        dev = (price - vwap_val) / vwap_val  # fraction
        if dev >= 0.001:           # price ≥ VWAP
            score += 1
            signals.append({"name": "VWAP",  "value": f"+{dev*100:.1f}%", "contribution":  1,
                             "description": "Price trading above session VWAP"})
        elif dev <= -0.020:        # price > 2% below VWAP → bearish intraday
            score -= 1
            signals.append({"name": "VWAP",  "value": f"{dev*100:.1f}%",  "contribution": -1,
                             "description": "Price more than 2% below session VWAP"})
        else:
            signals.append({"name": "VWAP",  "value": f"{dev*100:.1f}%",  "contribution":  0,
                             "description": "Price near (slightly below) VWAP"})

    # -----------------------------------------------------------------------
    # Signal 2: RSI(14) on 5-min bars
    # -----------------------------------------------------------------------
    rsi_val = rsi(bars_5min)
    if rsi_val is not None:
        if 45 <= rsi_val <= 65:
            score += 1
            signals.append({"name": "RSI",   "value": f"{rsi_val:.0f}",   "contribution":  1,
                             "description": "RSI in bullish momentum zone (45–65)"})
        elif rsi_val > 75 or rsi_val < 25:
            score -= 1
            signals.append({"name": "RSI",   "value": f"{rsi_val:.0f}",   "contribution": -1,
                             "description": "RSI overbought (>75) or severely oversold (<25)"})
        else:
            signals.append({"name": "RSI",   "value": f"{rsi_val:.0f}",   "contribution":  0,
                             "description": "RSI in neutral range"})

    # -----------------------------------------------------------------------
    # Signal 3: Volume activity (current bar vs session average)
    # -----------------------------------------------------------------------
    if len(bars_5min) >= 5:
        vols    = [float(b.get("v", 0)) for b in bars_5min]
        avg_vol = sum(vols) / len(vols)
        cur_vol = vols[-1]
        if avg_vol > 0:
            vol_ratio = cur_vol / avg_vol
            if vol_ratio >= 1.3:
                score += 1
                signals.append({"name": "Volume", "value": f"{vol_ratio:.1f}×", "contribution":  1,
                                 "description": "High volume — stock in play (≥1.3× average)"})
            elif vol_ratio < 0.7:
                score -= 1
                signals.append({"name": "Volume", "value": f"{vol_ratio:.1f}×", "contribution": -1,
                                 "description": "Low volume — illiquid, avoid entry (<0.7× average)"})
            else:
                signals.append({"name": "Volume", "value": f"{vol_ratio:.1f}×", "contribution":  0,
                                 "description": "Normal volume"})

    # -----------------------------------------------------------------------
    # Signal 4: Recent bar momentum (net move over last 5 bars)
    # -----------------------------------------------------------------------
    if len(bars_5min) >= 6:
        start = float(bars_5min[-6]["c"])
        end   = price
        if start > 0:
            mom_pct = (end - start) / start * 100
            if mom_pct >= 0.5:
                score += 1
                signals.append({"name": "Momentum", "value": f"+{mom_pct:.2f}%", "contribution":  1,
                                 "description": "Upward momentum in last 5 bars (≥+0.5%)"})
            elif mom_pct <= -0.5:
                score -= 1
                signals.append({"name": "Momentum", "value": f"{mom_pct:.2f}%",  "contribution": -1,
                                 "description": "Downward momentum in last 5 bars (≤−0.5%)"})
            else:
                signals.append({"name": "Momentum", "value": f"{mom_pct:.2f}%",  "contribution":  0,
                                 "description": "Sideways action over last 5 bars"})

    # -----------------------------------------------------------------------
    # Signal 5: Daily change vs previous close (requires daily bars)
    # -----------------------------------------------------------------------
    if daily_bars and len(daily_bars) >= 2:
        prev_close = float(daily_bars[-2]["c"])
        if prev_close > 0:
            daily_chg = (price - prev_close) / prev_close * 100
            if 1.0 <= daily_chg <= 5.0:
                score += 1
                signals.append({"name": "Daily Chg", "value": f"+{daily_chg:.1f}%", "contribution":  1,
                                 "description": "Mild positive day (+1% to +5%) — healthy momentum"})
            elif daily_chg < -2.0:
                score -= 1
                signals.append({"name": "Daily Chg", "value": f"{daily_chg:.1f}%",  "contribution": -1,
                                 "description": "Negative day (<−2%) — selling pressure"})
            else:
                signals.append({"name": "Daily Chg", "value": f"{daily_chg:.1f}%",  "contribution":  0,
                                 "description": "Flat or extended daily change"})

    # -----------------------------------------------------------------------
    # Signal 6: 20-day price breakout (requires daily bars)
    # -----------------------------------------------------------------------
    if daily_bars and len(daily_bars) >= 22:
        high_20d = max(float(b["h"]) for b in daily_bars[1:-1])  # 20 complete days excl. today
        if price > high_20d:
            score += 1
            signals.append({"name": "Breakout", "value": f"+{(price/high_20d - 1)*100:.1f}%", "contribution":  1,
                             "description": "Trading above the 20-day high — breakout"})
        else:
            signals.append({"name": "Breakout", "value": "No",    "contribution":  0,
                             "description": "Below the 20-day high"})

    return {
        "score":       score,
        "price":       price,
        "signals":     signals,
        "enough_data": len(bars_5min) >= 10,
    }
