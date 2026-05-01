"""Intraday Mean Reversion strategy.

Entry conditions:
  - Price is ≥1.5% below the session VWAP (intraday oversold)
  - RSI(14) on 5-minute bars is below 35 (confirming oversold state)
  - At least 20 bars traded today (100 min into session — VWAP needs to stabilize)

Exit conditions:
  - Take profit: price reaches the VWAP level at entry time
  - Stop loss:   2% below entry price
  - Max hold:    positions are also closed by EOD cleanup

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

STRATEGY         = "mean_reversion"
ENTRY_DEVIATION  = 0.015   # price must be ≥1.5% below VWAP
STOP_PCT         = 0.020   # 2% below entry
RSI_PERIOD       = 14
RSI_OVERSOLD     = 35
MIN_BARS_TO_TRADE = 20     # ~100 min into session


def _rsi(bars: list[dict], period: int = RSI_PERIOD) -> float | None:
    """RSI from bar closes. Returns None if not enough data."""
    closes = [float(b["c"]) for b in bars]
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(d, 0) for d in deltas]
    losses = [max(-d, 0) for d in deltas]

    # Wilder smoothing
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i])  / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1 + rs))


def run(db) -> None:
    if not shared.is_market_open():
        print("Market closed — exiting.")
        return

    # -----------------------------------------------------------------------
    # 1. Fetch today's 5-minute bars for universe + any open positions
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

    open_syms     = {t["symbol"] for t in open_trades}
    scan_syms     = list(set(shared.UNIVERSE) | open_syms)
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
        sym  = trade["symbol"]
        bars = intraday_bars.get(sym, [])
        if not bars:
            continue

        current_price = float(bars[-1]["c"])
        entry_price   = float(trade["entry_price"])
        stop_loss     = float(trade["stop_loss"])
        take_profit   = float(trade["take_profit"])
        qty           = int(trade["qty"])

        exit_status = exit_reason = None
        if current_price >= take_profit:
            exit_status = "closed"
            exit_reason = f"VWAP reversion target hit: ${current_price:.2f} ≥ ${take_profit:.2f}"
        elif current_price <= stop_loss:
            exit_status = "stopped"
            exit_reason = f"Stop hit: ${current_price:.2f} ≤ ${stop_loss:.2f}"

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
    # 3. Look for new mean-reversion entries
    # -----------------------------------------------------------------------
    slots = shared.MAX_POSITIONS_PER_STRATEGY - len(remaining_open)
    if slots <= 0:
        print("Max positions reached — no new entries.")
        return

    account      = shared.get_account()
    held_symbols = {t["symbol"] for t in remaining_open}
    entered      = 0

    for sym in shared.UNIVERSE:
        if entered >= slots:
            break
        if sym in held_symbols:
            continue

        bars = intraday_bars.get(sym, [])
        if len(bars) < MIN_BARS_TO_TRADE:
            continue

        current_price = float(bars[-1]["c"])
        current_vwap  = shared.calc_vwap(bars)

        if current_vwap <= 0:
            continue

        deviation_pct = (current_price - current_vwap) / current_vwap

        # Entry gate: price must be significantly below VWAP
        if deviation_pct > -ENTRY_DEVIATION:
            continue

        # Confirm with RSI oversold
        rsi = _rsi(bars)
        if rsi is None or rsi >= RSI_OVERSOLD:
            continue

        qty = shared.calc_position_qty(account, current_price)
        if qty <= 0:
            continue

        stop_loss   = round(current_price * (1 - STOP_PCT), 4)
        take_profit = round(current_vwap, 4)  # target = VWAP reversion

        print(
            f"  [ENTRY] {sym} @ ${current_price:.2f}  VWAP=${current_vwap:.2f}"
            f"  dev={deviation_pct*100:.1f}%  RSI={rsi:.0f}"
            f"  stop=${stop_loss:.2f}  target=${take_profit:.2f}"
        )

        oid = shared.place_order(sym, qty, "buy")
        shared.log_trade_open(
            db,
            symbol=sym,
            strategy=STRATEGY,
            qty=qty,
            entry_price=current_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            alpaca_order_id=oid,
            notes=f"Mean reversion: {deviation_pct*100:.1f}% below VWAP ${current_vwap:.2f}, RSI={rsi:.0f}",
        )
        entered += 1


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    print(f"[{datetime.now(timezone.utc).isoformat()}] Running {STRATEGY} strategy")
    run(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
