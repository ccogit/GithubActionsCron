"""Intraday Daily Baseline Rebalancer — opens a diversified portfolio at market open.

Runs once per day at ~9:35 AM ET, after the opening-bell chaos settles.

Uses daily signals already populated in Supabase by account 1's refresh workers:
  - technical_signals:          RSI/MACD/Bollinger composite buy_count / sell_count
  - finnhub_technical_advisory: Strong Buy / Buy / Neutral / Sell advisory
  - relative_strength:          3-month RS vs SPY benchmark
  - finnhub_metrics:            P/E TTM (valuation sanity check)

Scores each universe stock (-3 to +4), takes the top TARGET_POSITIONS,
and opens proportional positions using BASELINE_CAPITAL_FRAC of available equity.
The intraday portfolio manager and strategy workers then deploy the remainder
into shorter-term opportunities throughout the day.

Idempotent: will not open a second baseline if one was already opened today.
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
BASELINE_CAPITAL_FRAC = 0.70    # deploy 70 % of available equity at open
STOP_LOSS_PCT         = 0.025   # 2.5 % intraday stop
TAKE_PROFIT_PCT       = 0.06    # 6 % intraday target
TARGET_POSITIONS      = 10      # how many stocks to open at the baseline
MIN_DAILY_SCORE       = 0       # include neutral-or-better (score ≥ 0)


# ---------------------------------------------------------------------------
# Daily signal scoring
# ---------------------------------------------------------------------------

def _fetch_daily_scores(db, symbols: list[str]) -> dict[str, int]:
    """
    Score each symbol on stable daily signals from Supabase.

    Scoring breakdown (each signal ±1):
      technical_signals        buy_count ≥ 3   → +1 ; sell_count ≥ 3  → -1
      finnhub_technical_advisory Strong Buy/Buy → +1 ; Sell/Strong Sell → -1
      relative_strength        rs_3m > +5 %    → +1 ; rs_3m < -5 %     → -1
      finnhub_metrics          0 < P/E < 30    → +1

    Range: -3 to +4
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


def _already_opened_today(db) -> bool:
    """True if a daily_baseline position was already opened today (UTC date)."""
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
    print(f"  Universe scores ({len(ranked)} stocks):")
    for sym, sc in ranked:
        print(f"    {sym:6s} {sc:+d}")

    # -----------------------------------------------------------------------
    # 2. Select candidates: score ≥ MIN_DAILY_SCORE, capped at TARGET_POSITIONS
    # -----------------------------------------------------------------------
    candidates = [(sym, sc) for sym, sc in ranked if sc >= MIN_DAILY_SCORE]

    # If fewer than TARGET_POSITIONS qualify, fill from the best negatives
    if len(candidates) < TARGET_POSITIONS:
        negatives = [(sym, sc) for sym, sc in ranked if sc < MIN_DAILY_SCORE]
        fill = negatives[: TARGET_POSITIONS - len(candidates)]
        if fill:
            print(f"  Filling {len(fill)} slots from best-scoring negatives: "
                  f"{[s for s, _ in fill]}")
        candidates += fill

    candidates = candidates[:TARGET_POSITIONS]

    if not candidates:
        print("No candidates available — nothing to open.")
        return

    print(f"  Opening {len(candidates)} baseline positions: "
          f"{[c[0] for c in candidates]}")

    # -----------------------------------------------------------------------
    # 3. Budget = BASELINE_CAPITAL_FRAC × deployable equity
    # -----------------------------------------------------------------------
    account          = shared.get_account()
    positions        = shared.get_positions()
    equity           = float(account.get("equity", 0) or 0)
    already_invested = sum(float(p.get("market_value", 0) or 0) for p in positions)
    deployable       = max(0.0, equity - already_invested)
    budget           = deployable * BASELINE_CAPITAL_FRAC

    print(f"  Equity ${equity:.0f}  invested ${already_invested:.0f}  "
          f"deployable ${deployable:.0f}  budget ${budget:.0f}")

    if budget < shared.MIN_TRADE_USD * len(candidates):
        print(f"  Budget ${budget:.0f} too small — aborting.")
        return

    # -----------------------------------------------------------------------
    # 4. Score-proportional allocation with max(score, 0.5) weight floor
    # -----------------------------------------------------------------------
    weights = {sym: max(sc, 0.5) for sym, sc in candidates}
    total_w = sum(weights.values())
    allocs  = {sym: (w / total_w) * budget for sym, w in weights.items()}

    # -----------------------------------------------------------------------
    # 5. Fetch live prices and place orders
    # -----------------------------------------------------------------------
    syms    = [sym for sym, _ in candidates]
    intraday = shared.get_bars_multi(syms, timeframe="5Min", limit=3)

    for sym, sc in candidates:
        usd = allocs.get(sym, 0.0)
        if usd < shared.MIN_TRADE_USD:
            continue

        bars  = intraday.get(sym, [])
        price = float(bars[-1]["c"]) if bars else 0.0
        if price <= 0:
            print(f"  [skip] {sym}: no live price")
            continue

        qty = int(usd / price)
        if qty <= 0:
            continue

        stop   = round(price * (1 - STOP_LOSS_PCT),  4)
        target = round(price * (1 + TAKE_PROFIT_PCT), 4)

        print(f"  [ENTRY] {sym} @ ${price:.2f}  score={sc:+d}  "
              f"alloc=${usd:.0f}  qty={qty}  stop=${stop:.2f}  target=${target:.2f}")

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
