"""Intraday Portfolio Manager — score-driven cash deployment (second paper account).

Runs every minute. Scores every stock in UNIVERSE using intraday_attractiveness
(purely technical signals), then:

  1. EXIT:  Close positions whose score turned negative, or that hit a stop/target.
  2. ENTER: Deploy remaining cash into the top-scoring stocks not yet held,
            proportionally weighted by score, respecting the global 20-stock cap.

Separation guarantee
--------------------
- Uses ONLY the intraday attractiveness score (no Supabase signal tables from the
  main portfolio: no analyst_cache, no politician_trades, no technical_signals, etc.)
- Operates exclusively on the second paper account (INTRADAY_ALPACA_KEY/SECRET).
- Logs to intraday_trades with strategy='portfolio' — separate from main positions.
"""

import os
import sys
from datetime import datetime, timezone
from supabase import create_client

import intraday_shared as shared
from intraday_attractiveness import compute_intraday_score

SUPABASE_URL          = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]

STRATEGY         = "portfolio"
MIN_ENTRY_SCORE  = 2      # only enter if intraday score ≥ 2
EXIT_SCORE_FLOOR = 0      # close if score drops below 0
STOP_LOSS_PCT    = 0.03   # 3 % stop loss
TAKE_PROFIT_PCT  = 0.05   # 5 % take profit
MAX_DEPLOY_FRAC  = 0.60   # deploy at most 60% of buying power at once


def _score_all_universe() -> dict[str, dict]:
    """Fetch bars and compute intraday scores for the entire UNIVERSE."""
    intraday = shared.get_bars_multi(
        shared.UNIVERSE, timeframe="5Min", limit=78,
        start=shared.today_market_open_utc(),
    )
    daily    = shared.get_daily_bars_multi(shared.UNIVERSE, limit=22)
    spy_bars = intraday.get("SPY", [])
    scores: dict[str, dict] = {}
    for sym in shared.UNIVERSE:
        result = compute_intraday_score(
            intraday.get(sym, []), daily.get(sym, []), market_bars=spy_bars,
        )
        if result["enough_data"]:
            scores[sym] = result
    return scores


def _proportional_allocations(
    candidates: list[tuple[str, dict]],
    budget: float,
) -> dict[str, float]:
    """Score-proportional allocation with per-stock cap. Returns {symbol: usd}."""
    if not candidates:
        return {}
    cap      = shared.MAX_POSITION_USD   # hard per-stock ceiling
    total_sc = sum(r["score"] for _, r in candidates)
    if total_sc <= 0:
        return {}

    allocs: dict[str, float] = {}
    surplus = 0.0
    for sym, r in candidates:
        raw = (r["score"] / total_sc) * budget
        if raw > cap:
            surplus += raw - cap
            allocs[sym] = cap
        else:
            allocs[sym] = raw

    # One-pass redistribution of surplus to uncapped entries
    if surplus > 0:
        uncapped = [(s, a) for s, a in allocs.items() if a < cap]
        if uncapped:
            extra_each = surplus / len(uncapped)
            for s, a in uncapped:
                allocs[s] = min(a + extra_each, cap)

    return allocs


def run(db) -> None:
    if not shared.is_market_open():
        print("Market closed — exiting.")
        return

    # -----------------------------------------------------------------------
    # 1. Score every universe stock
    # -----------------------------------------------------------------------
    scores = _score_all_universe()
    print(f"Scored {len(scores)}/{len(shared.UNIVERSE)} universe stocks.")

    # -----------------------------------------------------------------------
    # 2. Fetch current state from Alpaca
    # -----------------------------------------------------------------------
    positions     = shared.get_positions()
    position_map  = {p["symbol"]: p for p in positions}
    account       = shared.get_account()
    buying_power  = float(account.get("buying_power", 0) or 0)

    # -----------------------------------------------------------------------
    # 3. Exit check — portfolio manager's own open trades
    # -----------------------------------------------------------------------
    open_trades: list[dict] = (
        db.table("intraday_trades")
        .select("*")
        .eq("strategy", STRATEGY)
        .eq("status", "open")
        .execute()
        .data or []
    )
    closed_ids: set[int] = set()
    for trade in open_trades:
        sym  = trade["symbol"]
        pos  = position_map.get(sym)
        if pos is None:
            continue  # already closed externally (e.g., EOD cleanup)

        current_price = float(pos["current_price"])
        entry_price   = float(trade["entry_price"])
        stop_loss     = float(trade["stop_loss"])
        take_profit   = float(trade["take_profit"])
        qty           = int(trade["qty"])
        score         = scores.get(sym, {}).get("score", -999)
        # unrealized_plpc is a decimal fraction, e.g. "0.0523" = +5.23%
        unr_plpc      = float(pos.get("unrealized_plpc", 0) or 0)

        exit_reason = exit_status = None
        if score < EXIT_SCORE_FLOOR:
            exit_status = "closed"
            exit_reason = f"Intraday score fell to {score} — exit"
        elif unr_plpc <= -STOP_LOSS_PCT:
            exit_status = "stopped"
            exit_reason = f"Stop loss hit: {unr_plpc*100:.1f}%"
        elif unr_plpc >= TAKE_PROFIT_PCT:
            exit_status = "closed"
            exit_reason = f"Take profit hit: {unr_plpc*100:.1f}%"
        elif current_price <= stop_loss:
            exit_status = "stopped"
            exit_reason = f"Price ${current_price:.2f} ≤ stop ${stop_loss:.2f}"
        elif current_price >= take_profit:
            exit_status = "closed"
            exit_reason = f"Price ${current_price:.2f} ≥ target ${take_profit:.2f}"

        if exit_reason:
            print(f"  [{exit_status}] {sym}: {exit_reason}")
            oid = shared.place_order(sym, qty, "sell")
            shared.log_trade_close(
                db,
                trade_id=int(trade["id"]),
                qty=qty,
                entry_price=entry_price,
                exit_price=current_price,
                exit_order_id=oid,
                status=exit_status,
                notes=exit_reason,
            )
            closed_ids.add(trade["id"])

    # Refresh positions after exits
    positions    = shared.get_positions()
    position_map = {p["symbol"]: p for p in positions}

    # -----------------------------------------------------------------------
    # 4. Determine available slots (global 20-stock cap)
    # -----------------------------------------------------------------------
    slots = shared.available_slots(positions)
    if slots <= 0:
        print(f"Portfolio at max capacity ({shared.MAX_TOTAL_POSITIONS} positions) — no new entries.")
        return

    # -----------------------------------------------------------------------
    # 5. Filter candidates
    # -----------------------------------------------------------------------
    already_held = shared.get_held_symbols(db, positions)

    candidates = [
        (sym, scores[sym])
        for sym in scores
        if scores[sym]["score"] >= MIN_ENTRY_SCORE
        and sym not in already_held
    ]
    candidates.sort(key=lambda x: x[1]["score"], reverse=True)
    candidates = candidates[:slots]  # respect global cap

    if not candidates:
        print("No qualifying candidates for cash deployment.")
        return

    # -----------------------------------------------------------------------
    # 6. Proportional allocation and order placement
    # -----------------------------------------------------------------------
    budget = min(buying_power * MAX_DEPLOY_FRAC, shared.MAX_POSITION_USD * len(candidates))
    allocs = _proportional_allocations(candidates, budget)

    print(f"Deploying ${budget:.0f} across {len(candidates)} candidate(s): "
          f"{[c[0] for c in candidates]}")

    for sym, result in candidates:
        usd = allocs.get(sym, 0)
        if usd < shared.MIN_TRADE_USD:
            continue
        price = result["price"]
        qty   = int(usd / price)
        if qty <= 0:
            continue

        stop   = round(price * (1 - STOP_LOSS_PCT),  4)
        target = round(price * (1 + TAKE_PROFIT_PCT), 4)
        sig_str = ", ".join(
            f"{s['name']}={s['value']}"
            for s in result["signals"]
            if s["contribution"] != 0
        )
        print(f"  [ENTRY] {sym} @ ${price:.2f}  score={result['score']}  "
              f"alloc=${usd:.0f}  qty={qty}  [{sig_str}]")

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
            notes=f"Intraday score {result['score']}: {sig_str}",
        )


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    print(f"[{datetime.now(timezone.utc).isoformat()}] Running intraday portfolio manager")
    run(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
