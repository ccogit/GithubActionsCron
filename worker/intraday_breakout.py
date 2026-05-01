"""Intraday Breakout + Volume Confirmation strategy (second paper account).

Pre-filter: only considers stocks with intraday attractiveness score ≥ 1.
Entry:      price breaks above the 20-trading-day high AND today's accumulated
            volume already exceeds 1.5× the 20-day average daily volume.
Stop:       1.5 % below entry price.
Target:     3.0 % above entry price (2:1 R/R).

Separation note: uses ONLY intraday_attractiveness signals (VWAP, RSI, volume,
momentum, breakout level). Does NOT read the main portfolio's Supabase signal
tables (analyst_cache, politician_trades, etc.).
"""

import os
import sys
from datetime import datetime, timezone
from supabase import create_client

import intraday_shared as shared
from intraday_attractiveness import compute_intraday_score

SUPABASE_URL          = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

STRATEGY              = "breakout"
MIN_ATTRACT_SCORE     = 1      # pre-filter: skip stocks with intraday score < 1
VOLUME_MULTIPLIER     = 1.5
STOP_PCT              = 0.015  # 1.5 %
TARGET_PCT            = 0.030  # 3.0 %
MIN_DAILY_BARS        = 22


def run(db) -> None:
    if not shared.is_market_open():
        print("Market closed — exiting.")
        return

    # -----------------------------------------------------------------------
    # 0. Fetch bars for the entire universe (shared with attractiveness check)
    # -----------------------------------------------------------------------
    daily_bars_map = shared.get_daily_bars_multi(shared.UNIVERSE, limit=MIN_DAILY_BARS)
    intraday_map   = shared.get_bars_multi(
        shared.UNIVERSE, timeframe="5Min", limit=78,
        start=shared.today_market_open_utc(),
    )

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
    closed_ids: set[int] = set()
    if open_trades:
        for trade in open_trades:
            sym  = trade["symbol"]
            bars = daily_bars_map.get(sym, [])
            if not bars:
                continue
            current_price = float(bars[-1]["c"])
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

            if exit_reason:
                print(f"  [{exit_status}] {sym}: {exit_reason}")
                oid = shared.place_order(sym, qty, "sell")
                shared.log_trade_close(
                    db,
                    trade_id=int(trade["id"]),
                    qty=qty,
                    entry_price=float(trade["entry_price"]),
                    exit_price=current_price,
                    exit_order_id=oid,
                    status=exit_status,
                    notes=exit_reason,
                )
                closed_ids.add(trade["id"])

    remaining_open = [t for t in open_trades if t["id"] not in closed_ids]

    # -----------------------------------------------------------------------
    # 3. Check per-strategy and global position caps
    # -----------------------------------------------------------------------
    if len(remaining_open) >= shared.MAX_POSITIONS_PER_STRATEGY:
        print(f"Strategy cap reached ({shared.MAX_POSITIONS_PER_STRATEGY}) — no new entries.")
        return

    positions = shared.get_positions()
    if shared.available_slots(positions) <= 0:
        print(f"Global cap ({shared.MAX_TOTAL_POSITIONS}) reached — no new entries.")
        return

    # -----------------------------------------------------------------------
    # 4. Scan universe for breakout + attractiveness signals
    # -----------------------------------------------------------------------
    already_held = shared.get_held_symbols(db, positions)
    account      = shared.get_account()
    candidates   = []

    for sym in shared.UNIVERSE:
        if sym in already_held:
            continue
        daily = daily_bars_map.get(sym, [])
        if len(daily) < MIN_DAILY_BARS:
            continue

        # Intraday attractiveness pre-filter
        attract = compute_intraday_score(
            intraday_map.get(sym, []), daily, market_bars=intraday_map.get("SPY", []),
        )
        if not attract["enough_data"] or attract["score"] < MIN_ATTRACT_SCORE:
            continue

        # Breakout-specific conditions
        lookback    = daily[1:-1]  # 20 complete trading days (skip oldest + today)
        high_20d    = max(float(b["h"]) for b in lookback)
        avg_vol_20d = sum(float(b["v"]) for b in lookback) / len(lookback)
        today_bar   = daily[-1]
        price       = float(today_bar["c"])
        today_vol   = float(today_bar["v"])

        if avg_vol_20d <= 0 or price <= 0:
            continue
        vol_ratio = today_vol / avg_vol_20d
        if price > high_20d and vol_ratio >= VOLUME_MULTIPLIER:
            candidates.append({
                "symbol":     sym,
                "price":      price,
                "high_20d":   high_20d,
                "vol_ratio":  vol_ratio,
                "attr_score": attract["score"],
            })

    candidates.sort(key=lambda x: x["vol_ratio"], reverse=True)
    slots = min(
        shared.MAX_POSITIONS_PER_STRATEGY - len(remaining_open),
        shared.available_slots(shared.get_positions()),
    )

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
            continue
        stop   = round(c["price"] * (1 - STOP_PCT),  4)
        target = round(c["price"] * (1 + TARGET_PCT), 4)
        print(f"  [ENTRY] {c['symbol']} @ ${c['price']:.2f}  vol={c['vol_ratio']:.1f}×  "
              f"score={c['attr_score']}  stop=${stop:.2f}  target=${target:.2f}")
        oid = shared.place_order(c["symbol"], qty, "buy")
        shared.log_trade_open(
            db,
            symbol=c["symbol"], strategy=STRATEGY, qty=qty,
            entry_price=c["price"], stop_loss=stop, take_profit=target,
            alpaca_order_id=oid,
            notes=(f"20d-high breakout: ${c['price']:.2f} > ${c['high_20d']:.2f}, "
                   f"vol {c['vol_ratio']:.1f}× avg, attr_score={c['attr_score']}"),
        )
        entered += 1


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    print(f"[{datetime.now(timezone.utc).isoformat()}] Running {STRATEGY} strategy")
    run(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
