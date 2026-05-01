"""Close all open intraday positions before market close.

Runs once daily shortly after the US market closes (via GitHub Actions schedule).
Closes every open position in the intraday paper account and marks the
corresponding intraday_trades rows as 'eod_closed'.
"""

import os
import sys
from datetime import datetime, timezone
from supabase import create_client
import intraday_shared as shared

SUPABASE_URL          = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE"]


def main() -> int:
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    print(f"[{datetime.now(timezone.utc).isoformat()}] Running EOD cleanup")

    positions = shared.get_positions()
    if not positions:
        print("No open positions — nothing to do.")
        return 0

    print(f"Closing {len(positions)} position(s)...")

    for pos in positions:
        sym           = pos.get("symbol", "")
        qty           = abs(int(float(pos.get("qty", 0))))
        current_price = float(pos.get("current_price", 0))

        if qty <= 0 or not sym:
            continue

        print(f"  Closing {sym} ×{qty} @ ${current_price:.2f}")
        oid = shared.place_order(sym, qty, "sell")

        # Update all open DB rows for this symbol
        open_trades: list[dict] = (
            db.table("intraday_trades")
            .select("id, qty, entry_price")
            .eq("symbol", sym)
            .eq("status", "open")
            .execute()
            .data or []
        )
        for trade in open_trades:
            shared.log_trade_close(
                db,
                trade_id=int(trade["id"]),
                qty=int(trade["qty"]),
                entry_price=float(trade["entry_price"]),
                exit_price=current_price,
                exit_order_id=oid,
                status="eod_closed",
                notes="EOD cleanup — closed before market close",
            )

    print("EOD cleanup complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
