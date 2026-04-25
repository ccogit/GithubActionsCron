"""
Real-time stock price streaming via Alpaca WebSocket + alert logic.
Runs as a persistent daemon, listening for trades on subscribed symbols.
Replaces the Finnhub HTTP polling cron approach.
"""

import asyncio
import json
import os
import resend
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Optional

import websockets
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE"]
RESEND_KEY = os.environ.get("RESEND_API_KEY", "")
ALERT_TO = os.environ.get("ALERT_EMAIL", "christopher.ridder@googlemail.com")

ALPACA_KEY = os.environ["ALPACA_KEY"]
ALPACA_SECRET = os.environ["ALPACA_SECRET"]
ALPACA_ENDPOINT = os.environ.get("ALPACA_ENDPOINT", "https://paper-api.alpaca.markets/v2")

ALPACA_WS = "wss://stream.data.alpaca.markets/v2/iex"

if RESEND_KEY:
    resend.api_key = RESEND_KEY


def supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def send_alert(symbol: str, price: float, min_price: float) -> bool:
    if not RESEND_KEY:
        print(f"  [warn] RESEND_API_KEY not configured — skipping email")
        return False
    try:
        resend.Emails.send({
            "from": "Stock Watcher <onboarding@resend.dev>",
            "to": [ALERT_TO],
            "subject": f"[Stock Alert] {symbol} fell below ${min_price:.2f}",
            "html": (
                f"<p><strong>{symbol}</strong> is trading at <strong>${price:.2f}</strong>, "
                f"below your minimum of <strong>${min_price:.2f}</strong>.</p>"
                f"<p>Triggered at {datetime.now(timezone.utc).isoformat()}</p>"
            ),
        })
        return True
    except Exception as exc:
        print(f"  [resend] error: {exc}")
        return False


def alpaca_sell(symbol: str) -> Optional[str]:
    """Returns the Alpaca order ID if a sell was placed, None otherwise."""
    auth_headers = {
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
    }

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
            print(f"  [alpaca] position lookup HTTP {exc.code}: {exc.reason}")
        return None
    except Exception as exc:
        print(f"  [alpaca] position lookup failed: {exc}")
        return None

    qty = pos.get("qty_available") or pos.get("qty") or "0"
    if float(qty) <= 0:
        print(f"  [alpaca] {symbol} position has no available qty")
        return None

    body = json.dumps({
        "symbol": symbol,
        "qty": qty,
        "side": "sell",
        "type": "market",
        "time_in_force": "day",
    }).encode()

    try:
        req = urllib.request.Request(
            f"{ALPACA_ENDPOINT}/orders",
            data=body,
            headers={**auth_headers, "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            order = json.loads(r.read())
            order_id = order.get("id")
            print(f"  [alpaca] sell {qty} {symbol} → order id={order_id}")
            return order_id
    except Exception as exc:
        print(f"  [alpaca] sell order failed: {exc}")
        return None


def check_alerts(db: Client, symbol: str, price: float) -> None:
    """Check if price crossed threshold and handle alert/sell logic."""
    watchlist = db.from_("watchlist").select("*").eq("symbol", symbol).execute().data
    if not watchlist:
        return

    row = watchlist[0]
    min_price = float(row["min_price"])
    alert_active = row["alert_active"]

    if min_price <= 0:
        return

    # Price dropped below threshold
    if price < min_price and not alert_active:
        print(f"  [alert] {symbol} @ ${price:.2f} < ${min_price:.2f}")
        email_sent = send_alert(symbol, price, min_price)

        order_id: Optional[str] = None
        try:
            order_id = alpaca_sell(symbol)
        except Exception as exc:
            print(f"  [alpaca] error: {exc}")

        db.from_("alert_log").insert({
            "symbol": symbol,
            "price": price,
            "min_price": min_price,
            "email_sent": email_sent,
            "order_placed": order_id is not None,
            "order_id": order_id,
        }).execute()

        db.from_("watchlist").update({"alert_active": True}).eq("symbol", symbol).execute()

    # Price recovered above threshold
    elif price >= min_price and alert_active:
        print(f"  [reset] {symbol} @ ${price:.2f} recovered above ${min_price:.2f}")
        db.from_("watchlist").update({"alert_active": False}).eq("symbol", symbol).execute()


async def connect_and_stream():
    """Main streaming loop: connect to Alpaca WebSocket and process trades."""
    db = supabase()
    backoff = 1

    while True:
        try:
            # Get symbols from watchlist
            watchlist = db.from_("watchlist").select("symbol").execute().data
            symbols = [row["symbol"] for row in watchlist]

            if not symbols:
                print("Watchlist empty, waiting 60s...")
                await asyncio.sleep(60)
                continue

            print(f"Connecting to Alpaca stream ({len(symbols)} symbols)...")

            async with websockets.connect(ALPACA_WS) as ws:
                # Authenticate
                auth_msg = {
                    "action": "auth",
                    "key": ALPACA_KEY,
                    "secret": ALPACA_SECRET,
                }
                await ws.send(json.dumps(auth_msg))
                response = await ws.recv()
                auth_response = json.loads(response)
                if auth_response.get("status") != "authorized":
                    print(f"Auth failed: {auth_response}")
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 60)
                    continue

                backoff = 1
                print("Authenticated. Subscribing to trades...")

                # Subscribe to trades (batch into groups of 30 for IEX feed limits)
                for i in range(0, len(symbols), 30):
                    batch = symbols[i : i + 30]
                    sub_msg = {"action": "subscribe", "trades": batch}
                    await ws.send(json.dumps(sub_msg))
                    print(f"  Subscribed to {batch}")

                # Listen for messages
                async for message in ws:
                    msg = json.loads(message)
                    msg_type = msg.get("T")

                    # Handle trade messages
                    if msg_type == "t":
                        data = msg.get("msg", {})
                        symbol = data.get("S")
                        price = data.get("p")
                        timestamp = data.get("t")

                        if symbol and price:
                            print(f"[trade] {symbol} @ ${price:.2f}")

                            # Store tick
                            db.from_("price_ticks").insert({
                                "symbol": symbol,
                                "price": price,
                                "fetched_at": timestamp or datetime.now(timezone.utc).isoformat(),
                            }).execute()

                            # Check alerts
                            check_alerts(db, symbol, price)

                    # Handle subscription confirmations
                    elif msg_type == "subscription":
                        print(f"Subscription confirmed: {msg.get('trades', [])}")

        except websockets.exceptions.WebSocketException as exc:
            print(f"WebSocket error: {exc}")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
        except Exception as exc:
            print(f"Error: {exc}")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)


if __name__ == "__main__":
    print("Starting Alpaca WebSocket stream...")
    asyncio.run(connect_and_stream())
