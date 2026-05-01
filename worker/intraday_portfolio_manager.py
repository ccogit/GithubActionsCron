"""Intraday Portfolio Manager — score-driven cash deployment (second paper account).

Runs every minute. Scores every stock in UNIVERSE using intraday_attractiveness
(purely technical signals), then:

  1. EXIT:  Close positions whose score turned negative, or that hit a stop/target.
  2. ENTER: Deploy all available cash into the top-scoring stocks not yet held,
            proportionally weighted by score, respecting the global 20-stock cap.

Budget rule
-----------
  deployable = equity − market_value_of_open_positions   (≈ cash on hand)
  budget     = deployable × DEPLOY_BUFFER                (5 % reserve for fills)

All budget is deployed — there is no MAX_DEPLOY_FRAC holdback.  Each candidate
receives (score / Σscores) × budget so better signals get more capital.

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
MIN_ENTRY_SCORE  = 1      # any net-positive signal qualifies
EXIT_SCORE_FLOOR = 0      # exit if score drops to 0 or below
STOP_LOSS_PCT    = 0.03   # 3 % hard stop
TAKE_PROFIT_PCT  = 0.05   # 5 % take-profit
DEPLOY_BUFFER    = 0.95   # keep 5 % cash reserve for order execution


def _score_all_universe() -> dict[str, dict]:
    """Fetch bars and compute intraday scores for the entire UNIVERSE."""
    intraday = shared.get_bars_multi(
        shared.UNIVERSE, timeframe="5Min", limit=78,
        start=shared.today_market_open_utc(),
    )
    daily    = shared.get_daily_bars_multi(shared.UNIVERSE, limit=22)
    spy_bars = intraday.get("SPY", [])

    # Warn about missing/sparse bar data
    empty = [s for s in shared.UNIVERSE if not intraday.get(s)]
    if empty:
        print(f"  [warn] No intraday bars: {', '.join(empty)}")
    sparse = [s for s in shared.UNIVERSE if 0 < len(intraday.get(s, [])) < 10]
    if sparse:
        print(f"  [warn] Sparse (<10 bars): "
              f"{', '.join(f'{s}={len(intraday[s])}' for s in sparse)}")

    scores: dict[str, dict] = {}
    for sym in shared.UNIVERSE:
        result = compute_intraday_score(
            intraday.get(sym, []), daily.get(sym, []), market_bars=spy_bars,
        )
        if result["enough_data"]:
            scores[sym] = result

    # Print score distribution so failures are visible in the Actions log
    ranked = sorted(scores.items(), key=lambda x: x[1]["score"], reverse=True)
    positives = [(s, r["score"]) for s, r in ranked if r["score"] >= 1]
    negatives = [(s, r["score"]) for s, r in ranked if r["score"] < 0]
    print(f"  Scores: {len(scores)} stocks scored  |  "
          f"≥1: {len(positives)}  |  <0: {len(negatives)}")
    if positives:
        print(f"  Top:  {', '.join(f'{s}={sc}' for s, sc in positives[:10])}")
    if negatives:
        print(f"  Neg:  {', '.join(f'{s}={sc}' for s, sc in negatives[:5])}")

    return scores


def _proportional_allocations(
    candidates: list[tuple[str, dict]],
    budget: float,
) -> dict[str, float]:
    """
    Pure score-proportional allocation — no per-stock cap.

    Each candidate receives (score / Σscores) × budget.
    The sum of all allocations equals budget exactly.
    Falls back to equal allocation if all scores are identical.
    """
    if not candidates or budget <= 0:
        return {}
    total_sc = sum(r["score"] for _, r in candidates)
    if total_sc <= 0:
        # Fallback: equal split (all scores equal or zero)
        per = budget / len(candidates)
        return {sym: per for sym, _ in candidates}
    return {sym: (r["score"] / total_sc) * budget for sym, r in candidates}


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
    positions    = shared.get_positions()
    position_map = {p["symbol"]: p for p in positions}
    account      = shared.get_account()

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
        sym = trade["symbol"]
        pos = position_map.get(sym)
        if pos is None:
            continue  # already closed externally (e.g. EOD cleanup)

        current_price = float(pos["current_price"])
        entry_price   = float(trade["entry_price"])
        stop_loss     = float(trade["stop_loss"])
        take_profit   = float(trade["take_profit"])
        qty           = int(trade["qty"])
        score         = scores.get(sym, {}).get("score", -999)
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
    # 5. Compute deployable cash
    #    equity − market_value_already_invested ≈ uninvested cash
    # -----------------------------------------------------------------------
    equity           = float(account.get("equity", 0) or 0)
    already_invested = sum(float(p.get("market_value", 0) or 0) for p in positions)
    deployable_cash  = max(0.0, equity - already_invested)
    budget           = deployable_cash * DEPLOY_BUFFER

    print(f"Equity ${equity:.0f}  invested ${already_invested:.0f}  "
          f"deployable ${deployable_cash:.0f}  budget ${budget:.0f}")

    if budget < shared.MIN_TRADE_USD:
        print(f"Available cash too small to deploy (${budget:.0f} < ${shared.MIN_TRADE_USD:.0f}).")
        return

    # -----------------------------------------------------------------------
    # 6. Filter candidates: score ≥ 1, not already held
    # -----------------------------------------------------------------------
    already_held = shared.get_held_symbols(db, positions)

    candidates = [
        (sym, scores[sym])
        for sym in scores
        if scores[sym]["score"] >= MIN_ENTRY_SCORE
        and sym not in already_held
    ]
    candidates.sort(key=lambda x: x[1]["score"], reverse=True)
    candidates = candidates[:slots]  # respect global 20-position cap

    if not candidates:
        print("No qualifying candidates (all held or score < 1).")
        return

    # -----------------------------------------------------------------------
    # 7. Score-proportional allocation and order placement
    # -----------------------------------------------------------------------
    allocs = _proportional_allocations(candidates, budget)

    print(f"Deploying ${budget:.0f} across {len(candidates)} candidate(s): "
          f"{[c[0] for c in candidates]}")

    for sym, result in candidates:
        usd = allocs.get(sym, 0.0)
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
