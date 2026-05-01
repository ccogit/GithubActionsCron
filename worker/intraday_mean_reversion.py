"""Intraday Mean Reversion strategy (second paper account).

Pre-filter: only considers stocks with intraday attractiveness score ≥ 1.
Entry:      price is ≥ 1.5 % below session VWAP AND RSI(14) on 5-min bars < 35.
            Requires ≥ 20 bars (≈100 min) so VWAP is statistically meaningful.
Target:     VWAP level at entry time (reversion to mean).
Stop:       2 % below entry price.

Separation note: uses ONLY intraday_attractiveness signals — no main portfolio
Supabase tables are read.
"""

import os
import sys
from datetime import datetime, timezone
from supabase import create_client

import intraday_shared as shared
from intraday_attractiveness import compute_intraday_score, rsi as calc_rsi

SUPABASE_URL          = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

STRATEGY          = "mean_reversion"
MIN_ATTRACT_SCORE = 1
ENTRY_DEVIATION   = 0.015   # price must be ≥ 1.5 % below VWAP
STOP_PCT          = 0.020   # 2 %
RSI_OVERSOLD      = 35
MIN_BARS_TO_TRADE = 20


def run(db) -> None:
    if not shared.is_market_open():
        print("Market closed — exiting.")
        return

    # -----------------------------------------------------------------------
    # 0. Fetch bars for the full universe
    # -----------------------------------------------------------------------
    intraday_map = shared.get_bars_multi(
        shared.UNIVERSE, timeframe="5Min", limit=78,
        start=shared.today_market_open_utc(),
    )
    daily_map = shared.get_daily_bars_multi(shared.UNIVERSE, limit=22)

    # -----------------------------------------------------------------------
    # 1. Open trades for this strategy
    # -----------------------------------------------------------------------
    open_trades: list[dict] = (
        db.table("intraday_trades")
        .select("*")
        .eq("strategy", STRATEGY)
        .eq("status", "open")
        .execute()
        .data or []
    )
    print(f"Open {STRATEGY} trades: {len(open_trades)}")

    # -----------------------------------------------------------------------
    # 2. Exit check
    # -----------------------------------------------------------------------
    closed_ids: set[int] = set()
    for trade in open_trades:
        sym  = trade["symbol"]
        bars = intraday_map.get(sym, [])
        if not bars:
            continue

        current_price = float(bars[-1]["c"])
        stop_loss     = float(trade["stop_loss"])
        take_profit   = float(trade["take_profit"])
        qty           = int(trade["qty"])

        exit_status = exit_reason = None
        if current_price >= take_profit:
            exit_status = "closed"
            exit_reason = f"VWAP reversion target: ${current_price:.2f} ≥ ${take_profit:.2f}"
        elif current_price <= stop_loss:
            exit_status = "stopped"
            exit_reason = f"Stop hit: ${current_price:.2f} ≤ ${stop_loss:.2f}"

        if exit_reason:
            print(f"  [{exit_status}] {sym}: {exit_reason}")
            oid = shared.place_order(sym, qty, "sell")
            shared.log_trade_close(
                db,
                trade_id=int(trade["id"]), qty=qty,
                entry_price=float(trade["entry_price"]), exit_price=current_price,
                exit_order_id=oid, status=exit_status, notes=exit_reason,
            )
            closed_ids.add(trade["id"])

    remaining_open = [t for t in open_trades if t["id"] not in closed_ids]

    # -----------------------------------------------------------------------
    # 3. Cap checks
    # -----------------------------------------------------------------------
    if len(remaining_open) >= shared.MAX_POSITIONS_PER_STRATEGY:
        print(f"Strategy cap reached — no new entries.")
        return
    positions = shared.get_positions()
    if shared.available_slots(positions) <= 0:
        print(f"Global cap ({shared.MAX_TOTAL_POSITIONS}) reached — no new entries.")
        return

    # -----------------------------------------------------------------------
    # 4. Scan for mean reversion entries
    # -----------------------------------------------------------------------
    already_held = shared.get_held_symbols(db, positions)
    account      = shared.get_account()
    entered      = 0
    slots        = min(
        shared.MAX_POSITIONS_PER_STRATEGY - len(remaining_open),
        shared.available_slots(positions),
    )

    for sym in shared.UNIVERSE:
        if entered >= slots:
            break
        if sym in already_held:
            continue
        bars = intraday_map.get(sym, [])
        if len(bars) < MIN_BARS_TO_TRADE:
            continue

        # Intraday attractiveness pre-filter (score ≥ 1 even for mean reversion)
        attract = compute_intraday_score(
            bars, daily_map.get(sym, []), market_bars=intraday_map.get("SPY", []),
        )
        if not attract["enough_data"] or attract["score"] < MIN_ATTRACT_SCORE:
            continue

        current_price = float(bars[-1]["c"])
        current_vwap  = shared.calc_vwap(bars)
        if current_vwap <= 0:
            continue

        deviation_pct = (current_price - current_vwap) / current_vwap
        if deviation_pct > -ENTRY_DEVIATION:
            continue  # not far enough below VWAP

        rsi_val = calc_rsi(bars)
        if rsi_val is None or rsi_val >= RSI_OVERSOLD:
            continue  # RSI must confirm oversold

        qty = shared.calc_position_qty(account, current_price)
        if qty <= 0:
            continue

        stop_loss   = round(current_price * (1 - STOP_PCT), 4)
        take_profit = round(current_vwap, 4)

        print(
            f"  [ENTRY] {sym} @ ${current_price:.2f}  VWAP=${current_vwap:.2f}  "
            f"dev={deviation_pct*100:.1f}%  RSI={rsi_val:.0f}  "
            f"score={attract['score']}  stop=${stop_loss:.2f}  target=${take_profit:.2f}"
        )
        oid = shared.place_order(sym, qty, "buy")
        shared.log_trade_open(
            db,
            symbol=sym, strategy=STRATEGY, qty=qty,
            entry_price=current_price, stop_loss=stop_loss, take_profit=take_profit,
            alpaca_order_id=oid,
            notes=(f"Mean reversion: {deviation_pct*100:.1f}% below VWAP "
                   f"${current_vwap:.2f}, RSI={rsi_val:.0f}, attr_score={attract['score']}"),
        )
        entered += 1


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    print(f"[{datetime.now(timezone.utc).isoformat()}] Running {STRATEGY} strategy")
    run(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
