"""
Single-pass stock price tick: fetch → store → alert → sell.
Triggered once per minute via repository_dispatch from cron-job.org.
"""

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone

import finnhub
import resend
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE"]
FINNHUB_KEY = os.environ["FINNHUB_API_KEY"]
RESEND_KEY = os.environ["RESEND_API_KEY"]
ALERT_TO = "christopher.ridder@googlemail.com"

ALPACA_KEY = os.environ.get("ALPACA_KEY", "")
ALPACA_SECRET = os.environ.get("ALPACA_SECRET", "")
ALPACA_ENDPOINT = os.environ.get("ALPACA_ENDPOINT", "https://paper-api.alpaca.markets/v2")

resend.api_key = RESEND_KEY


def supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_prices(symbols: list[str]) -> dict[str, float]:
    client = finnhub.Client(api_key=FINNHUB_KEY)
    prices: dict[str, float] = {}
    for symbol in symbols:
        try:
            quote = client.quote(symbol)
            # 'c' is current price; 0.0 means market closed / invalid symbol
            if quote.get("c", 0) > 0:
                prices[symbol] = quote["c"]
            else:
                print(f"  [warn] no price for {symbol}: {quote}")
        except Exception as exc:
            print(f"  [error] finnhub {symbol}: {exc}")
    return prices


def send_alert(symbol: str, price: float, min_price: float) -> None:
    resend.Emails.send({
        "from": "Stock Watcher <onboarding@resend.dev>",
        "to": [ALERT_TO],
        "subject": f"[Stock Alert] {symbol} fell below {min_price}",
        "html": (
            f"<p><strong>{symbol}</strong> is trading at <strong>${price:.2f}</strong>, "
            f"below your minimum of <strong>${min_price:.2f}</strong>.</p>"
            f"<p>Triggered at {datetime.now(timezone.utc).isoformat()}</p>"
        ),
    })


def alpaca_sell(symbol: str) -> None:
    if not ALPACA_KEY or not ALPACA_SECRET:
        print("  [alpaca] skipped — ALPACA_KEY/SECRET not configured")
        return

    auth_headers = {
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
    }

    # Only sell if a position is actually held
    try:
        req = urllib.request.Request(
            f"{ALPACA_ENDPOINT}/positions/{symbol}",
            headers=auth_headers,
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            pos = json.loads(r.read())
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            print(f"  [alpaca] no position in {symbol} — skipping sell order")
        else:
            print(f"  [alpaca] position lookup error HTTP {exc.code}: {exc.reason}")
        return
    except Exception as exc:
        print(f"  [alpaca] position lookup failed: {exc} — skipping sell order")
        return

    qty = pos.get("qty_available") or pos.get("qty") or "0"
    if float(qty) <= 0:
        print(f"  [alpaca] {symbol} position has no available qty — skipping sell order")
        return

    body = json.dumps({
        "symbol": symbol,
        "qty": qty,
        "side": "sell",
        "type": "market",
        "time_in_force": "day",
    }).encode()

    req = urllib.request.Request(
        f"{ALPACA_ENDPOINT}/orders",
        data=body,
        headers={**auth_headers, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        order = json.loads(r.read())
        print(f"  [alpaca] sell {qty} {symbol} → order id={order.get('id')}")


def run() -> None:
    db = supabase()

    watchlist = db.from_("watchlist").select("*").execute().data
    if not watchlist:
        print("Watchlist empty — nothing to do.")
        return

    symbols = [row["symbol"] for row in watchlist]
    prices = fetch_prices(symbols)
    if not prices:
        print("No prices fetched.")
        return

    now = datetime.now(timezone.utc).isoformat()

    # Batch insert ticks
    ticks = [{"symbol": s, "price": p, "fetched_at": now} for s, p in prices.items()]
    db.from_("price_ticks").insert(ticks).execute()
    print(f"Inserted {len(ticks)} ticks.")

    # Check thresholds
    for row in watchlist:
        symbol = row["symbol"]
        if symbol not in prices:
            continue

        price = prices[symbol]
        min_price = float(row["min_price"])
        cooldown = row["alert_cooldown_until"]

        if min_price > 0 and price < min_price:
            cooldown_dt = datetime.fromisoformat(cooldown.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) >= cooldown_dt:
                print(f"  [alert] {symbol} @ ${price:.2f} < ${min_price:.2f} — sending email")
                send_alert(symbol, price, min_price)

                try:
                    alpaca_sell(symbol)
                except Exception as exc:
                    print(f"  [alpaca] error placing sell order: {exc}")

                # Insert alert log
                db.from_("alert_log").insert({
                    "symbol": symbol, "price": price, "min_price": min_price
                }).execute()

                # Set 1-hour cooldown
                from datetime import timedelta
                new_cooldown = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
                db.from_("watchlist").update(
                    {"alert_cooldown_until": new_cooldown}
                ).eq("symbol", symbol).execute()
            else:
                print(f"  [skip] {symbol} alert in cooldown until {cooldown}")


if __name__ == "__main__":
    run()
