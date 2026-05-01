"""Intraday Daily Baseline Rebalancer — opens a diversified portfolio at market open.

Runs once per day at ~9:35 AM ET, after the opening-bell chaos settles.

Uses daily signals already populated in Supabase by account 1's refresh workers:
  - technical_signals:          RSI/MACD/Bollinger composite buy_count / sell_count
  - finnhub_technical_advisory: Strong Buy / Buy / Neutral / Sell advisory
  - relative_strength:          3-month RS vs SPY benchmark
  - finnhub_metrics:            P/E TTM (valuation sanity check)

Scores each universe stock (-3 to +4), then ALWAYS picks the top TARGET_POSITIONS
stocks regardless of score direction (no pass/fail threshold). Equal-weight
allocation guarantees every position receives the same capital slice.

Idempotent: skips if any daily_baseline trades exist for today.
Strategy tag:  'daily_baseline'
EOD:           positions closed by intraday_eod_cleanup.py
Intraday exit: stop/target monitored every minute by intraday_portfolio_manager.py
"""

import os
import sys
from datetime import datetime, timezone
from supabase import create_client

import intraday_shared as shared

SUPABASE_URL          = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

STRATEGY              = "daily_baseline"
BASELINE_CAPITAL_FRAC = 0.80    # deploy 80 % of available equity at open
STOP_LOSS_PCT         = 0.03    # 3 % hard stop
TAKE_PROFIT_PCT       = 0.07    # 7 % take-profit
TARGET_POSITIONS      = 10      # always open exactly this many stocks


# ---------------------------------------------------------------------------
# Daily signal scoring
# ---------------------------------------------------------------------------

def _fetch_daily_scores(db, symbols: list[str]) -> dict[str, int]:
    """
    Score each symbol on stable daily signals from Supabase.

    Scoring breakdown (each signal ±1):
      technical_signals          buy_count ≥ 3   → +1 ; sell_count ≥ 3  → -1
      finnhub_technical_advisory Strong Buy/Buy   → +1 ; Sell/Strong Sell → -1
      relative_strength          rs_3m > +5 %     → +1 ; rs_3m < -5 %    → -1
      finnhub_metrics            0 < P/E < 30     → +1

    Range: -3 to +4. Defaults to 0 for any symbol missing from a table.
    """
    scores: dict[str, int] = {s: 0 for s in symbols}

    try:
        rows = (
            db.table("technical_signals")
            .select("symbol, buy_count, sell_count")
            .in_("symbol", symbols)
            .execute().data or []
        )
        for r in rows:
            sym = r["symbol"]
            if sym not in scores:
                continue
            if (r.get("buy_count")  or 0) >= 3:
                scores[sym] += 1
            if (r.get("sell_count") or 0) >= 3:
                scores[sym] -= 1
    except Exception as e:
        print(f"  [daily] technical_signals: {e}")

    try:
        rows = (
            db.table("finnhub_technical_advisory")
            .select("symbol, advisory")
            .in_("symbol", symbols)
            .execute().data or []
        )
        for r in rows:
            sym = r["symbol"]
            if sym not in scores:
                continue
            adv = r.get("advisory") or ""
            if adv in ("Strong Buy", "Buy"):
                scores[sym] += 1
            elif adv in ("Strong Sell", "Sell"):
                scores[sym] -= 1
    except Exception as e:
        print(f"  [daily] finnhub_technical_advisory: {e}")

    try:
        rows = (
            db.table("relative_strength")
            .select("symbol, rs_3m")
            .in_("symbol", symbols)
            .execute().data or []
        )
        for r in rows:
            sym = r["symbol"]
            if sym not in scores:
                continue
            rs = float(r.get("rs_3m") or 0)
            if rs > 0.05:
                scores[sym] += 1
            elif rs < -0.05:
                scores[sym] -= 1
    except Exception as e:
        print(f"  [daily] relative_strength: {e}")

    try:
        rows = (
            db.table("finnhub_metrics")
            .select("symbol, pe_ttm")
            .in_("symbol", symbols)
            .execute().data or []
        )
        for r in rows:
            sym = r["symbol"]
            if sym not in scores:
                continue
            pe = r.get("pe_ttm")
            if pe and 0 < float(pe) < 30:
                scores[sym] += 1
    except Exception as e:
        print(f"  [daily] finnhub_metrics: {e}")

    return scores


def _get_prices(symbols: list[str]) -> dict[str, float]:
    """
    Fetch the most recent price for each symbol.

    Tries 5-min intraday bars first (available once trading has started),
    then falls back to the previous daily close. This ensures price data
    is available even when IEX hasn't generated enough intraday bars yet.
    """
    prices: dict[str, float] = {}

    # Primary: latest 5-min bar close
    try:
        intraday = shared.get_bars_multi(symbols, timeframe="5Min", limit=5)
        for sym, bars in intraday.items():
            if bars:
                p = float(bars[-1]["c"])
                if p > 0:
                    prices[sym] = p
    except Exception as e:
        print(f"  [prices] intraday bars: {e}")

    # Fallback: previous daily close for any symbol still missing
    missing = [s for s in symbols if s not in prices]
    if missing:
        try:
            daily = shared.get_daily_bars_multi(missing, limit=2)
            for sym, bars in daily.items():
                if bars:
                    p = float(bars[-1]["c"])
                    if p > 0:
                        prices[sym] = p
        except Exception as e:
            print(f"  [prices] daily bars fallback: {e}")

    still_missing = [s for s in symbols if s not in prices]
    if still_missing:
        print(f"  [warn] No price data for: {', '.join(still_missing)}")

    return prices


def _already_opened_today(db) -> bool:
    """True if any daily_baseline trades were opened today (UTC date)."""
    today_iso = datetime.now(timezone.utc).date().isoformat()
    try:
        rows = (
            db.table("intraday_trades")
            .select("id")
            .eq("strategy", STRATEGY)
            .gte("entry_time", today_iso)
            .limit(1)
            .execute().data or []
        )
        return len(rows) > 0
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(db) -> None:
    if not shared.is_market_open():
        print("Market closed — exiting.")
        return

    if _already_opened_today(db):
        print("Daily baseline already opened today — skipping.")
        return

    # -----------------------------------------------------------------------
    # 1. Score the universe on daily signals
    # -----------------------------------------------------------------------
    print("Fetching daily scores from Supabase signal tables...")
    daily_scores = _fetch_daily_scores(db, shared.UNIVERSE)

    ranked = sorted(daily_scores.items(), key=lambda x: x[1], reverse=True)
    print(f"  Ranked universe ({len(ranked)} stocks):")
    for sym, sc in ranked:
        print(f"    {sym:6s} {sc:+d}")

    # -----------------------------------------------------------------------
    # 2. Always pick top TARGET_POSITIONS stocks — no pass/fail threshold.
    #    Equal-weight allocation ensures every position gets the same capital.
    # -----------------------------------------------------------------------
    candidates = ranked[:TARGET_POSITIONS]
    print(f"\n  Selected top {len(candidates)}: {[s for s, _ in candidates]}")

    # -----------------------------------------------------------------------
    # 3. Fetch prices (intraday bars first, daily close as fallback)
    # -----------------------------------------------------------------------
    syms   = [sym for sym, _ in candidates]
    prices = _get_prices(syms)

    # Drop any candidates we couldn't price
    candidates = [(sym, sc) for sym, sc in candidates if prices.get(sym, 0) > 0]
    if not candidates:
        print("No priced candidates — aborting.")
        return
    if len(candidates) < TARGET_POSITIONS:
        print(f"  [warn] Only {len(candidates)} of {TARGET_POSITIONS} candidates have prices.")

    # -----------------------------------------------------------------------
    # 4. Budget = BASELINE_CAPITAL_FRAC × deployable equity
    # -----------------------------------------------------------------------
    account          = shared.get_account()
    positions        = shared.get_positions()
    equity           = float(account.get("equity", 0) or 0)
    already_invested = sum(float(p.get("market_value", 0) or 0) for p in positions)
    deployable       = max(0.0, equity - already_invested)
    budget           = deployable * BASELINE_CAPITAL_FRAC

    print(f"\n  Equity ${equity:.0f}  invested ${already_invested:.0f}  "
          f"deployable ${deployable:.0f}  budget ${budget:.0f}")

    if budget < shared.MIN_TRADE_USD * len(candidates):
        print(f"  Budget ${budget:.0f} too small for {len(candidates)} positions — aborting.")
        return

    # -----------------------------------------------------------------------
    # 5. Equal-weight allocation: every stock gets budget / n
    # -----------------------------------------------------------------------
    per_stock = budget / len(candidates)
    print(f"  Equal weight: ${per_stock:.0f} per stock × {len(candidates)} stocks\n")

    for sym, sc in candidates:
        price = prices[sym]
        qty   = int(per_stock / price)
        if qty <= 0:
            print(f"  [skip] {sym} @ ${price:.2f}: qty rounds to 0 "
                  f"(need ${price:.0f}+, have ${per_stock:.0f})")
            continue

        stop   = round(price * (1 - STOP_LOSS_PCT),  4)
        target = round(price * (1 + TAKE_PROFIT_PCT), 4)

        print(f"  [ENTRY] {sym:6s} @ ${price:.2f}  score={sc:+d}  "
              f"qty={qty}  alloc=${qty*price:.0f}  "
              f"stop=${stop:.2f}  target=${target:.2f}")

        oid = shared.place_order(sym, qty, "buy")
        shared.log_trade_open(
            db,
            symbol=sym,
            strategy=STRATEGY,
            qty=qty,
            entry_price=price,
            stop_loss=stop,
            take_profit=target,
            alpaca_order_id=oid,
            notes=f"Daily baseline score {sc:+d}",
        )


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    print(f"[{datetime.now(timezone.utc).isoformat()}] Running intraday daily rebalance")
    run(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
