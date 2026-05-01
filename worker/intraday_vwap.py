"""Intraday VWAP-based strategy (second paper account).

Pre-filter: only considers stocks with intraday attractiveness score ≥ 1.
Entry:      price crosses above the session VWAP (previous bar below, current bar
            above) with current bar volume ≥ 1.2× average bar volume.
            Requires ≥ 12 bars traded (≈60 min into session — avoids open chop).
Exit:       dynamic — price falls back below VWAP.
Stop:       1 % below entry-time VWAP.
Target:     2 % above entry price.

Separation note: uses ONLY intraday_attractiveness signals. Does NOT read the
main portfolio's Supabase signal tables.
"""

import os
import sys
from datetime import datetime, timezone
from supabase import create_client

import intraday_shared as shared
from intraday_attractiveness import compute_intraday_score

SUPABASE_URL          = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

STRATEGY          = "vwap"
MIN_ATTRACT_SCORE = 1
VOLUME_MULTIPLIER = 1.2
STOP_PCT          = 0.010
TARGET_PCT        = 0.020
MIN_BARS_TO_TRADE = 12


def run(db) -> None:
    if not shared.is_market_open():
        print("Market closed — exiting.")
        return

    # -----------------------------------------------------------------------
    # 0. Fetch today's 5-minute bars + daily bars for the full universe
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
        if len(bars) < 2:
            continue

        current_price = float(bars[-1]["c"])
        current_vwap  = shared.calc_vwap(bars)
        stop_loss     = float(trade["stop_loss"])
        take_profit   = float(trade["take_profit"])
        qty           = int(trade["qty"])

        exit_status = exit_reason = None
        if current_price <= stop_loss:
            exit_status = "stopped"
            exit_reason = f"Stop hit: ${current_price:.2f} ≤ ${stop_loss:.2f}"
        elif current_price >= take_profit:
            exit_status = "closed"
            exit_reason = f"Target hit: ${current_price:.2f} ≥ ${take_profit:.2f}"
        elif current_price < current_vwap:
            exit_status = "closed"
            exit_reason = f"Price ${current_price:.2f} fell below VWAP ${current_vwap:.2f}"

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
    # 4. Scan for VWAP crossover entries
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

        # Intraday attractiveness pre-filter
        attract = compute_intraday_score(
            bars, daily_map.get(sym, []), market_bars=intraday_map.get("SPY", []),
        )
        if not attract["enough_data"] or attract["score"] < MIN_ATTRACT_SCORE:
            continue

        # VWAP crossover condition
        vwaps       = shared.vwap_series(bars)
        avg_bar_vol = sum(float(b.get("v", 0)) for b in bars) / len(bars)
        prev_close  = float(bars[-2]["c"])
        prev_vwap   = vwaps[-2]
        curr_close  = float(bars[-1]["c"])
        curr_vwap   = vwaps[-1]
        curr_vol    = float(bars[-1].get("v", 0))

        crossed_above = prev_close < prev_vwap and curr_close > curr_vwap
        vol_confirmed = avg_bar_vol > 0 and curr_vol >= avg_bar_vol * VOLUME_MULTIPLIER
        if not (crossed_above and vol_confirmed):
            continue

        qty = shared.calc_position_qty(account, curr_close)
        if qty <= 0:
            continue

        stop   = round(curr_vwap  * (1 - STOP_PCT),  4)
        target = round(curr_close * (1 + TARGET_PCT), 4)
        print(f"  [ENTRY] {sym} @ ${curr_close:.2f}  VWAP=${curr_vwap:.2f}  "
              f"score={attract['score']}  stop=${stop:.2f}  target=${target:.2f}")
        oid = shared.place_order(sym, qty, "buy")
        shared.log_trade_open(
            db,
            symbol=sym, strategy=STRATEGY, qty=qty,
            entry_price=curr_close, stop_loss=stop, take_profit=target,
            alpaca_order_id=oid,
            notes=(f"VWAP crossover: {prev_close:.2f}<{prev_vwap:.2f} → "
                   f"{curr_close:.2f}>{curr_vwap:.2f}, "
                   f"vol {curr_vol/avg_bar_vol:.1f}×, attr_score={attract['score']}"),
        )
        entered += 1


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    print(f"[{datetime.now(timezone.utc).isoformat()}] Running {STRATEGY} strategy")
    run(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
