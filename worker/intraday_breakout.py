"""Intraday Breakout + Volume Confirmation strategy.

Entry conditions:
  - Current price breaks above the 20-trading-day high
  - Today's accumulated volume already exceeds 1.5× the 20-day average daily volume

Exit conditions:
  - Stop loss:   1.5% below entry price
  - Take profit: 3.0% above entry price  (2:1 R/R)

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

STRATEGY          = "breakout"
VOLUME_MULTIPLIER = 1.5
STOP_PCT          = 0.015   # 1.5%
TARGET_PCT        = 0.030   # 3.0%
MIN_LOOKBACK_BARS = 22      # need at least 22 daily bars (20 complete + yesterday + today)


def run(db) -> None:
    if not shared.is_market_open():
        print("Market closed — exiting.")
        return

    # -----------------------------------------------------------------------
    # 1. Fetch open trades for this strategy
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
    # 2. Exit check for existing positions
    # -----------------------------------------------------------------------
    if open_trades:
        open_syms = [t["symbol"] for t in open_trades]
        # Use the daily bars endpoint to get today's current price
        bars_by_sym = shared.get_bars_multi(open_syms, timeframe="1Day", limit=1)
        closed_ids: set[int] = set()

        for trade in open_trades:
            sym   = trade["symbol"]
            bars  = bars_by_sym.get(sym, [])
            if not bars:
                continue

            current_price = float(bars[-1]["c"])
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

        open_trades = [t for t in open_trades if t["id"] not in closed_ids]

    # -----------------------------------------------------------------------
    # 3. Check for new entry signals
    # -----------------------------------------------------------------------
    slots = shared.MAX_POSITIONS_PER_STRATEGY - len(open_trades)
    if slots <= 0:
        print(f"Max positions reached — no new entries.")
        return

    account      = shared.get_account()
    held_symbols = {t["symbol"] for t in open_trades}
    candidates   = _scan_universe(held_symbols)
    if not candidates:
        print("No breakout signals found.")
        return

    print(f"Breakout candidates: {[c['symbol'] for c in candidates]}")
    entered = 0
    for c in candidates:
        if entered >= slots:
            break
        qty = shared.calc_position_qty(account, c["price"])
        if qty <= 0:
            print(f"  [{c['symbol']}] qty=0 — skipping")
            continue

        stop   = round(c["price"] * (1 - STOP_PCT), 4)
        target = round(c["price"] * (1 + TARGET_PCT), 4)
        print(f"  [ENTRY] {c['symbol']} @ ${c['price']:.2f}  stop=${stop:.2f}  target=${target:.2f}  vol_ratio={c['vol_ratio']:.1f}×")

        oid = shared.place_order(c["symbol"], qty, "buy")
        shared.log_trade_open(
            db,
            symbol=c["symbol"],
            strategy=STRATEGY,
            qty=qty,
            entry_price=c["price"],
            stop_loss=stop,
            take_profit=target,
            alpaca_order_id=oid,
            notes=f"20d-high breakout: ${c['price']:.2f} > ${c['high_20d']:.2f}, vol {c['vol_ratio']:.1f}× avg",
        )
        entered += 1


def _scan_universe(exclude: set[str]) -> list[dict]:
    """Scan the universe for breakout signals. Returns sorted list of candidates."""
    candidates = []
    scan_syms = [s for s in shared.UNIVERSE if s not in exclude]
    daily_bars = shared.get_daily_bars_multi(scan_syms, limit=MIN_LOOKBACK_BARS)

    for sym in scan_syms:
        bars = daily_bars.get(sym, [])
        if len(bars) < MIN_LOOKBACK_BARS:
            continue

        # bars[-1] = today's partial bar, bars[-22:-2] = last 20 complete trading days
        lookback      = bars[1:-1]          # 20 complete days (skip oldest, skip today)
        high_20d      = max(b["h"] for b in lookback)
        avg_vol_20d   = sum(b["v"] for b in lookback) / len(lookback)

        today_bar     = bars[-1]
        current_price = float(today_bar["c"])
        today_volume  = float(today_bar["v"])

        if avg_vol_20d <= 0 or current_price <= 0:
            continue

        vol_ratio = today_volume / avg_vol_20d
        if current_price > high_20d and vol_ratio >= VOLUME_MULTIPLIER:
            candidates.append({
                "symbol":    sym,
                "price":     current_price,
                "high_20d":  high_20d,
                "vol_ratio": vol_ratio,
            })

    candidates.sort(key=lambda x: x["vol_ratio"], reverse=True)
    return candidates


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    print(f"[{datetime.now(timezone.utc).isoformat()}] Running {STRATEGY} strategy")
    run(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
