"""Intraday VWAP-based strategy.

Entry conditions:
  - Price crosses above the cumulative VWAP (previous bar was below, current bar is above)
  - Current bar volume > 1.2× average bar volume for today's session (confirms momentum)
  - At least 12 bars have traded today (60 min into session — avoids open-range chop)

Exit conditions:
  - Dynamic: price falls back below VWAP (momentum faded)
  - Hard stop: 1% below VWAP at entry time
  - Take profit: 2% above entry price

Position sizing: up to 8% of buying power, capped at $2,000 per trade.
Max simultaneous positions: 3.
"""

import os
import sys
from datetime import datetime, timezone
from supabase import create_client
import intraday_shared as shared

SUPABASE_URL          = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

STRATEGY          = "vwap"
VOLUME_MULTIPLIER = 1.2    # bar volume must exceed N× average bar volume
STOP_PCT          = 0.010  # 1% below entry VWAP
TARGET_PCT        = 0.020  # 2% above entry price
MIN_BARS_TO_TRADE = 12     # don't trade in the first ~60 minutes


def run(db) -> None:
    if not shared.is_market_open():
        print("Market closed — exiting.")
        return

    # -----------------------------------------------------------------------
    # 1. Fetch today's 5-minute bars for the full universe + open positions
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

    open_syms    = {t["symbol"] for t in open_trades}
    scan_syms    = list(set(shared.UNIVERSE) | open_syms)
    intraday_bars = shared.get_bars_multi(
        scan_syms,
        timeframe="5Min",
        limit=78,
        start=shared.today_market_open_utc(),
    )

    # -----------------------------------------------------------------------
    # 2. Exit check for existing positions
    # -----------------------------------------------------------------------
    closed_ids: set[int] = set()
    for trade in open_trades:
        sym          = trade["symbol"]
        bars         = intraday_bars.get(sym, [])
        if len(bars) < 2:
            continue

        current_price = float(bars[-1]["c"])
        current_vwap  = shared.calc_vwap(bars)
        entry_price   = float(trade["entry_price"])
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
            exit_reason = f"Price fell below VWAP (${current_vwap:.2f})"

        if exit_status:
            print(f"  [{exit_status}] {sym}: {exit_reason}")
            oid = shared.place_order(sym, qty, "sell")
            shared.log_trade_close(
                db,
                trade_id=trade["id"],
                qty=qty,
                entry_price=entry_price,
                exit_price=current_price,
                exit_order_id=oid,
                status=exit_status,
                notes=exit_reason,
            )
            closed_ids.add(trade["id"])

    remaining_open = [t for t in open_trades if t["id"] not in closed_ids]

    # -----------------------------------------------------------------------
    # 3. Look for new VWAP crossover entries
    # -----------------------------------------------------------------------
    slots = shared.MAX_POSITIONS_PER_STRATEGY - len(remaining_open)
    if slots <= 0:
        print("Max positions reached — no new entries.")
        return

    account       = shared.get_account()
    held_symbols  = {t["symbol"] for t in remaining_open}
    entered       = 0

    for sym in shared.UNIVERSE:
        if entered >= slots:
            break
        if sym in held_symbols:
            continue

        bars = intraday_bars.get(sym, [])
        if len(bars) < MIN_BARS_TO_TRADE:
            continue

        vwaps        = shared.vwap_series(bars)
        avg_bar_vol  = sum(float(b.get("v", 0)) for b in bars) / len(bars)

        prev_close   = float(bars[-2]["c"])
        prev_vwap    = vwaps[-2]
        curr_close   = float(bars[-1]["c"])
        curr_vwap    = vwaps[-1]
        curr_vol     = float(bars[-1].get("v", 0))

        crossed_above   = prev_close < prev_vwap and curr_close > curr_vwap
        vol_confirmed   = avg_bar_vol > 0 and curr_vol >= avg_bar_vol * VOLUME_MULTIPLIER

        if not (crossed_above and vol_confirmed):
            continue

        qty = shared.calc_position_qty(account, curr_close)
        if qty <= 0:
            continue

        stop   = round(curr_vwap  * (1 - STOP_PCT),  4)
        target = round(curr_close * (1 + TARGET_PCT), 4)
        print(f"  [ENTRY] {sym} @ ${curr_close:.2f}  VWAP=${curr_vwap:.2f}  stop=${stop:.2f}  target=${target:.2f}")

        oid = shared.place_order(sym, qty, "buy")
        shared.log_trade_open(
            db,
            symbol=sym,
            strategy=STRATEGY,
            qty=qty,
            entry_price=curr_close,
            stop_loss=stop,
            take_profit=target,
            alpaca_order_id=oid,
            notes=f"VWAP crossover from below: ${prev_close:.2f}<${prev_vwap:.2f} → ${curr_close:.2f}>${curr_vwap:.2f}, vol {curr_vol/avg_bar_vol:.1f}× avg",
        )
        entered += 1


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    print(f"[{datetime.now(timezone.utc).isoformat()}] Running {STRATEGY} strategy")
    run(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
