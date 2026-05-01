"""Intraday attractiveness score — technical/momentum signals only.

Completely separate from the main portfolio's daily score (computeAttractiveness
in attractiveness.ts), which uses fundamental, news, and congressional-trade signals.

This module uses only live intraday market data so it can re-score stocks
every minute during the trading session.

Signals (each ±1):
  1.  VWAP position    — price above/below session VWAP
  2.  RSI(14) 5-min    — momentum zone check
  3.  Volume activity  — current bar vs session average
  4.  Bar momentum     — net change over last 5 bars
  5.  Daily change     — today's open-to-current vs yesterday's close
  6.  20-day breakout  — price above 20-day high (daily bars)
  7.  EMA cross        — 9-EMA vs 20-EMA alignment with price
  8.  ATR activity     — stock "in play" volatility check
  9.  Opening Range    — ORB to upside/downside after first 30 min
  10. Market alignment — SPY direction vs its own VWAP and momentum
  11. MACD histogram   — 12/26/9 MACD divergence direction

Score range: −8 to +11.
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
# EMA helper
# ---------------------------------------------------------------------------

def _ema(values: list[float], period: int) -> list[float]:
    """Exponential Moving Average. Returns N-period+1 values, aligned to end."""
    if len(values) < period:
        return []
    k = 2.0 / (period + 1)
    result = [sum(values[:period]) / period]
    for v in values[period:]:
        result.append(result[-1] * (1 - k) + v * k)
    return result


# ---------------------------------------------------------------------------
# ATR helper
# ---------------------------------------------------------------------------

def _atr(bars: list[dict], period: int = 14) -> float | None:
    """Average True Range over last `period` bars. Returns None if insufficient."""
    if len(bars) < period + 1:
        return None
    trs = []
    for i in range(1, len(bars)):
        h  = float(bars[i]["h"])
        lo = float(bars[i]["l"])
        pc = float(bars[i - 1]["c"])
        trs.append(max(h - lo, abs(h - pc), abs(lo - pc)))
    return sum(trs[-period:]) / period if len(trs) >= period else None


# ---------------------------------------------------------------------------
# VWAP helper (duplicated from intraday_shared to keep this module standalone)
# ---------------------------------------------------------------------------

def _vwap(bars: list[dict]) -> float:
    cum_tpv = cum_v = 0.0
    for b in bars:
        tp = (float(b["h"]) + float(b["l"]) + float(b["c"])) / 3.0
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
    market_bars: list[dict] | None = None,
) -> dict:
    """
    Score a stock for intraday trading based entirely on live market data.

    Parameters
    ----------
    bars_5min    Today's 5-minute OHLCV bars (chronological, oldest first).
    daily_bars   Recent daily OHLCV bars. Optional; enables signals 5 and 6.
    market_bars  SPY 5-minute bars for market-alignment signal (signal 10).

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
        dev = (price - vwap_val) / vwap_val
        if dev >= 0.001:
            score += 1
            signals.append({"name": "VWAP", "value": f"+{dev*100:.1f}%", "contribution": 1,
                             "description": "Price trading above session VWAP"})
        elif dev <= -0.020:
            score -= 1
            signals.append({"name": "VWAP", "value": f"{dev*100:.1f}%", "contribution": -1,
                             "description": "Price more than 2% below session VWAP"})
        else:
            signals.append({"name": "VWAP", "value": f"{dev*100:.1f}%", "contribution": 0,
                             "description": "Price near (slightly below) VWAP"})

    # -----------------------------------------------------------------------
    # Signal 2: RSI(14) on 5-min bars
    # -----------------------------------------------------------------------
    rsi_val = rsi(bars_5min)
    if rsi_val is not None:
        if 45 <= rsi_val <= 65:
            score += 1
            signals.append({"name": "RSI", "value": f"{rsi_val:.0f}", "contribution": 1,
                             "description": "RSI in bullish momentum zone (45–65)"})
        elif rsi_val > 75 or rsi_val < 25:
            score -= 1
            signals.append({"name": "RSI", "value": f"{rsi_val:.0f}", "contribution": -1,
                             "description": "RSI overbought (>75) or severely oversold (<25)"})
        else:
            signals.append({"name": "RSI", "value": f"{rsi_val:.0f}", "contribution": 0,
                             "description": "RSI in neutral range"})

    # -----------------------------------------------------------------------
    # Signal 3: Volume activity (current bar vs session average)
    # Thresholds are intentionally loose: afternoon volume is naturally lower
    # than the morning rush, so a moderate afternoon bar should score neutral.
    # -----------------------------------------------------------------------
    if len(bars_5min) >= 5:
        vols    = [float(b.get("v", 0)) for b in bars_5min]
        avg_vol = sum(vols) / len(vols)
        cur_vol = vols[-1]
        if avg_vol > 0:
            vol_ratio = cur_vol / avg_vol
            if vol_ratio >= 1.5:
                score += 1
                signals.append({"name": "Volume", "value": f"{vol_ratio:.1f}×", "contribution": 1,
                                 "description": "High volume — stock in play (≥1.5× average)"})
            elif vol_ratio < 0.5:
                score -= 1
                signals.append({"name": "Volume", "value": f"{vol_ratio:.1f}×", "contribution": -1,
                                 "description": "Very low volume — illiquid, avoid entry (<0.5× average)"})
            else:
                signals.append({"name": "Volume", "value": f"{vol_ratio:.1f}×", "contribution": 0,
                                 "description": "Normal volume"})

    # -----------------------------------------------------------------------
    # Signal 4: Recent bar momentum (net move over last 5 bars)
    # -----------------------------------------------------------------------
    if len(bars_5min) >= 6:
        start = float(bars_5min[-6]["c"])
        if start > 0:
            mom_pct = (price - start) / start * 100
            if mom_pct >= 0.5:
                score += 1
                signals.append({"name": "Momentum", "value": f"+{mom_pct:.2f}%", "contribution": 1,
                                 "description": "Upward momentum in last 5 bars (≥+0.5%)"})
            elif mom_pct <= -0.5:
                score -= 1
                signals.append({"name": "Momentum", "value": f"{mom_pct:.2f}%", "contribution": -1,
                                 "description": "Downward momentum in last 5 bars (≤−0.5%)"})
            else:
                signals.append({"name": "Momentum", "value": f"{mom_pct:.2f}%", "contribution": 0,
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
                signals.append({"name": "Daily Chg", "value": f"+{daily_chg:.1f}%", "contribution": 1,
                                 "description": "Mild positive day (+1% to +5%) — healthy momentum"})
            elif daily_chg < -2.0:
                score -= 1
                signals.append({"name": "Daily Chg", "value": f"{daily_chg:.1f}%", "contribution": -1,
                                 "description": "Negative day (<−2%) — selling pressure"})
            else:
                signals.append({"name": "Daily Chg", "value": f"{daily_chg:.1f}%", "contribution": 0,
                                 "description": "Flat or extended daily change"})

    # -----------------------------------------------------------------------
    # Signal 6: 20-day price breakout (requires daily bars)
    # -----------------------------------------------------------------------
    if daily_bars and len(daily_bars) >= 22:
        high_20d = max(float(b["h"]) for b in daily_bars[1:-1])
        if price > high_20d:
            score += 1
            signals.append({"name": "Breakout", "value": f"+{(price/high_20d - 1)*100:.1f}%", "contribution": 1,
                             "description": "Trading above the 20-day high — breakout"})
        else:
            signals.append({"name": "Breakout", "value": "No", "contribution": 0,
                             "description": "Below the 20-day high"})

    # -----------------------------------------------------------------------
    # Signal 7: EMA cross — 9-EMA vs 20-EMA alignment
    # Bullish: 9-EMA > 20-EMA and price > 9-EMA (short-term trend up, price leading)
    # Bearish: 9-EMA < 20-EMA and price < 9-EMA (short-term trend down, price lagging)
    # -----------------------------------------------------------------------
    if len(bars_5min) >= 20:
        closes = [float(b["c"]) for b in bars_5min]
        ema9  = _ema(closes, 9)
        ema20 = _ema(closes, 20)
        if ema9 and ema20:
            e9, e20 = ema9[-1], ema20[-1]
            if e9 > e20 and price > e9:
                score += 1
                signals.append({"name": "EMA Cross", "value": f"9>{e9:.2f}>20>{e20:.2f}", "contribution": 1,
                                 "description": "9-EMA above 20-EMA and price above 9-EMA — uptrend"})
            elif e9 < e20 and price < e9:
                score -= 1
                signals.append({"name": "EMA Cross", "value": f"9<{e9:.2f}<20<{e20:.2f}", "contribution": -1,
                                 "description": "9-EMA below 20-EMA and price below 9-EMA — downtrend"})
            else:
                signals.append({"name": "EMA Cross", "value": f"9={e9:.2f}/20={e20:.2f}", "contribution": 0,
                                 "description": "EMA alignment mixed — no clear trend"})

    # -----------------------------------------------------------------------
    # Signal 8: ATR activity — "in play" filter
    # Calibrated for 5-minute bars of large-cap US equities.
    # Typical 5-min ATR for $100-500 stocks: 0.1–0.5% of price.
    # High ATR (≥0.5%): actively moving, good intraday opportunity.
    # Very low ATR (<0.1%): stock is basically frozen — avoid.
    # -----------------------------------------------------------------------
    atr_val = _atr(bars_5min)
    if atr_val is not None and price > 0:
        atr_pct = atr_val / price * 100
        if atr_pct >= 0.5:
            score += 1
            signals.append({"name": "ATR", "value": f"{atr_pct:.2f}%", "contribution": 1,
                             "description": "High ATR — stock is actively moving (≥0.5% of price)"})
        elif atr_pct < 0.1:
            score -= 1
            signals.append({"name": "ATR", "value": f"{atr_pct:.2f}%", "contribution": -1,
                             "description": "Very low ATR — stock barely moving (<0.1%)"})
        else:
            signals.append({"name": "ATR", "value": f"{atr_pct:.2f}%", "contribution": 0,
                             "description": "Normal ATR range for 5-min bars"})

    # -----------------------------------------------------------------------
    # Signal 9: Opening Range Breakout (first 6 bars = first 30 min)
    # Requires ≥12 bars (60 min) so the ORB has had time to develop.
    # ORB to upside: strongest signal for day traders.
    # ORB to downside: distribution day, avoid longs.
    # -----------------------------------------------------------------------
    if len(bars_5min) >= 12:
        or_high = max(float(b["h"]) for b in bars_5min[:6])
        or_low  = min(float(b["l"]) for b in bars_5min[:6])
        if price > or_high:
            score += 1
            signals.append({"name": "ORB", "value": f">{or_high:.2f}", "contribution": 1,
                             "description": "Price above 30-min opening range high — bullish ORB"})
        elif price < or_low:
            score -= 1
            signals.append({"name": "ORB", "value": f"<{or_low:.2f}", "contribution": -1,
                             "description": "Price below 30-min opening range low — bearish breakdown"})
        else:
            signals.append({"name": "ORB", "value": f"[{or_low:.2f}–{or_high:.2f}]", "contribution": 0,
                             "description": "Price still inside 30-min opening range — wait"})

    # -----------------------------------------------------------------------
    # Signal 10: Market alignment — SPY VWAP + 5-bar momentum
    # A market tailwind lifts all boats; headwind suppresses individual setups.
    # -----------------------------------------------------------------------
    if market_bars and len(market_bars) >= 6:
        spy_vwap  = _vwap(market_bars)
        spy_price = float(market_bars[-1]["c"])
        spy_start = float(market_bars[-6]["c"])
        spy_mom   = (spy_price - spy_start) / spy_start if spy_start > 0 else 0.0
        if spy_vwap > 0:
            if spy_price > spy_vwap and spy_mom > 0.001:
                score += 1
                signals.append({"name": "Market", "value": f"SPY +{spy_mom*100:.1f}%", "contribution": 1,
                                 "description": "Market tailwind — SPY above VWAP with positive momentum"})
            elif spy_price < spy_vwap and spy_mom < -0.001:
                score -= 1
                signals.append({"name": "Market", "value": f"SPY {spy_mom*100:.1f}%", "contribution": -1,
                                 "description": "Market headwind — SPY below VWAP with negative momentum"})
            else:
                signals.append({"name": "Market", "value": "SPY neutral", "contribution": 0,
                                 "description": "SPY showing no strong directional bias"})

    # -----------------------------------------------------------------------
    # Signal 11: MACD histogram direction (12/26/9 on 5-min closes)
    # Histogram > 0 and rising:  MACD accelerating above signal — momentum building
    # Histogram < 0 and falling: MACD accelerating below signal — selling pressure
    # Requires ≥35 bars to have enough warmup for all three EMAs.
    # -----------------------------------------------------------------------
    if len(bars_5min) >= 35:
        closes = [float(b["c"]) for b in bars_5min]
        ema12  = _ema(closes, 12)
        ema26  = _ema(closes, 26)
        if ema12 and ema26:
            offset    = len(ema12) - len(ema26)
            macd_line = [ema12[i + offset] - ema26[i] for i in range(len(ema26))]
            sig_line  = _ema(macd_line, 9)
            if sig_line and len(sig_line) >= 2:
                hist      = macd_line[-1] - sig_line[-1]
                hist_prev = macd_line[-(len(sig_line))] - sig_line[-2]  # prior histogram value
                if hist > 0 and hist > hist_prev:
                    score += 1
                    signals.append({"name": "MACD", "value": f"+{hist:.4f}↑", "contribution": 1,
                                     "description": "MACD histogram positive and rising — momentum accelerating"})
                elif hist < 0 and hist < hist_prev:
                    score -= 1
                    signals.append({"name": "MACD", "value": f"{hist:.4f}↓", "contribution": -1,
                                     "description": "MACD histogram negative and falling — selling accelerating"})
                else:
                    signals.append({"name": "MACD", "value": f"{hist:.4f}", "contribution": 0,
                                     "description": "MACD histogram not accelerating in either direction"})

    return {
        "score":       score,
        "price":       price,
        "signals":     signals,
        "enough_data": len(bars_5min) >= 10,
    }
