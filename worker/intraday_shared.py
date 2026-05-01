"""Shared utilities for intraday trading strategies (second paper account).

All intraday workers import this module. It handles:
- Alpaca API calls (trading + data) for the second paper account
- Market hours detection (DST-aware via zoneinfo)
- VWAP calculation
- Supabase trade logging helpers
- Global position cap (MAX_TOTAL_POSITIONS = 20)
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

INTRADAY_ALPACA_KEY    = os.environ["INTRADAY_ALPACA_KEY"]
INTRADAY_ALPACA_SECRET = os.environ["INTRADAY_ALPACA_SECRET"]

TRADE_BASE = "https://paper-api.alpaca.markets/v2"
DATA_BASE  = "https://data.alpaca.markets/v2"

# ---------------------------------------------------------------------------
# Universe — liquid large-cap US equities for the intraday account.
# Completely separate from the main portfolio's index_constituents table.
# ---------------------------------------------------------------------------
UNIVERSE = [
    # Mega-cap tech
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO",
    # Mid-cap tech / growth
    "AMD", "NFLX", "PLTR", "COIN", "CRM",
    # Financials
    "JPM", "BAC", "GS",
    # Consumer / industrial
    "WMT", "HD",
    # ETFs (high liquidity, moderate volatility)
    "QQQ", "SPY", "IWM",
]

# ---------------------------------------------------------------------------
# Portfolio limits — these govern the intraday account ONLY
# ---------------------------------------------------------------------------
MAX_TOTAL_POSITIONS    = 20   # hard cap across all strategies
MAX_POSITIONS_PER_STRATEGY = 3
MAX_POSITION_PCT       = 0.05   # max 5% of buying power per trade
MAX_POSITION_USD       = 5000.0 # hard per-position cap (~5% of $100k account)
MIN_TRADE_USD          = 500.0

ET = ZoneInfo("America/New_York")


# ---------------------------------------------------------------------------
# Market hours
# ---------------------------------------------------------------------------

def is_market_open() -> bool:
    """True if US equities market is currently open (9:30–16:00 ET, Mon–Fri)."""
    now_et = datetime.now(ET)
    if now_et.weekday() >= 5:
        return False
    open_et  = now_et.replace(hour=9,  minute=30, second=0, microsecond=0)
    close_et = now_et.replace(hour=15, minute=55, second=0, microsecond=0)
    return open_et <= now_et <= close_et


def today_market_open_utc() -> str:
    """ISO-8601 UTC timestamp for today's market open (9:30 AM ET)."""
    now_et  = datetime.now(ET)
    open_et = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
    return open_et.astimezone(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _hdrs() -> dict[str, str]:
    return {
        "APCA-API-KEY-ID":     INTRADAY_ALPACA_KEY,
        "APCA-API-SECRET-KEY": INTRADAY_ALPACA_SECRET,
        "Content-Type":        "application/json",
    }


def _get(url: str) -> dict | list:
    req = urllib.request.Request(url, headers=_hdrs())
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def _post(url: str, body: dict) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers=_hdrs(), method="POST"
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


# ---------------------------------------------------------------------------
# Alpaca account / trading
# ---------------------------------------------------------------------------

def get_account() -> dict:
    try:
        return _get(f"{TRADE_BASE}/account")
    except Exception as e:
        print(f"  [account] {e}")
        return {}


def get_positions() -> list[dict]:
    try:
        result = _get(f"{TRADE_BASE}/positions")
        return result if isinstance(result, list) else []
    except Exception as e:
        print(f"  [positions] {e}")
        return []


def place_order(symbol: str, qty: int, side: str) -> Optional[str]:
    """Place a market order. Returns Alpaca order ID or None on failure."""
    try:
        order = _post(f"{TRADE_BASE}/orders", {
            "symbol": symbol,
            "qty":    str(qty),
            "side":   side,
            "type":   "market",
            "time_in_force": "day",
        })
        oid = order.get("id")
        print(f"  [order] {side.upper()} {qty}× {symbol} → {oid}")
        return oid
    except urllib.error.HTTPError as e:
        print(f"  [order] {side} {symbol}: HTTP {e.code} — {e.read().decode()[:200]}")
        return None
    except Exception as e:
        print(f"  [order] {side} {symbol}: {e}")
        return None


def close_all_positions() -> list[str]:
    """Close all open positions. Returns list of closed symbols."""
    closed = []
    for pos in get_positions():
        sym = pos.get("symbol", "")
        qty = abs(int(float(pos.get("qty", 0))))
        if qty > 0 and sym:
            oid = place_order(sym, qty, "sell")
            if oid:
                closed.append(sym)
    return closed


# ---------------------------------------------------------------------------
# Global position tracking helpers
# ---------------------------------------------------------------------------

def get_held_symbols(db, alpaca_positions: list[dict]) -> set[str]:
    """
    All symbols currently held or pending across ALL intraday strategies.

    Combines live Alpaca positions (filled orders) with open intraday_trades
    rows (placed but possibly not yet filled) to prevent double-buying during
    the same minute cycle.
    """
    alpaca_syms: set[str] = {p["symbol"] for p in alpaca_positions}
    try:
        rows = (
            db.table("intraday_trades")
            .select("symbol")
            .eq("status", "open")
            .execute()
            .data or []
        )
        pending_syms: set[str] = {r["symbol"] for r in rows}
    except Exception:
        pending_syms = set()
    return alpaca_syms | pending_syms


def available_slots(alpaca_positions: list[dict]) -> int:
    """How many more positions can be opened before hitting MAX_TOTAL_POSITIONS."""
    return max(0, MAX_TOTAL_POSITIONS - len(alpaca_positions))


# ---------------------------------------------------------------------------
# Alpaca market data
# ---------------------------------------------------------------------------

def get_bars_multi(
    symbols: list[str],
    timeframe: str = "5Min",
    limit: int = 78,
    start: Optional[str] = None,
) -> dict[str, list[dict]]:
    """Fetch OHLCV bars for multiple symbols in batches of 10."""
    if not symbols:
        return {}
    result: dict[str, list[dict]] = {}
    for i in range(0, len(symbols), 10):
        batch = symbols[i:i + 10]
        params: dict[str, str] = {
            "symbols":    ",".join(batch),
            "timeframe":  timeframe,
            "limit":      str(limit),
            "feed":       "iex",
            "adjustment": "raw",
        }
        if start:
            params["start"] = start
        url = f"{DATA_BASE}/stocks/bars?" + urllib.parse.urlencode(params)
        try:
            data = _get(url)
            for sym, bars in (data.get("bars") or {}).items():
                result[sym] = bars
        except Exception as e:
            print(f"  [bars] batch {batch[:3]}…: {e}")
    return result


def get_daily_bars_multi(symbols: list[str], limit: int = 22) -> dict[str, list[dict]]:
    """Fetch daily OHLCV bars for multiple symbols."""
    return get_bars_multi(symbols, timeframe="1Day", limit=limit)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

def calc_vwap(bars: list[dict]) -> float:
    """Cumulative VWAP over all provided bars."""
    cum_tpv = cum_v = 0.0
    for b in bars:
        tp = (b["h"] + b["l"] + b["c"]) / 3.0
        v  = float(b.get("v", 0))
        cum_tpv += tp * v
        cum_v   += v
    return cum_tpv / cum_v if cum_v > 0 else 0.0


def vwap_series(bars: list[dict]) -> list[float]:
    """Incrementally-computed VWAP for each bar (same length as bars)."""
    result: list[float] = []
    cum_tpv = cum_v = 0.0
    for b in bars:
        tp = (b["h"] + b["l"] + b["c"]) / 3.0
        v  = float(b.get("v", 0))
        cum_tpv += tp * v
        cum_v   += v
        result.append(cum_tpv / cum_v if cum_v > 0 else 0.0)
    return result


# ---------------------------------------------------------------------------
# Supabase trade logging
# ---------------------------------------------------------------------------

def log_trade_open(
    db,
    *,
    symbol: str,
    strategy: str,
    qty: int,
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    alpaca_order_id: Optional[str] = None,
    notes: str = "",
) -> Optional[int]:
    """Insert an open trade record. Returns new row ID or None."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        res = (
            db.table("intraday_trades")
            .insert({
                "symbol":          symbol,
                "strategy":        strategy,
                "qty":             qty,
                "entry_price":     round(entry_price, 4),
                "stop_loss":       round(stop_loss,   4),
                "take_profit":     round(take_profit, 4),
                "entry_time":      now,
                "status":          "open",
                "notes":           notes,
                "alpaca_order_id": alpaca_order_id,
                "updated_at":      now,
            })
            .execute()
        )
        rows = res.data or []
        trade_id = rows[0]["id"] if rows else None
        print(f"  [db] logged open trade id={trade_id} — {strategy} {symbol} ×{qty}")
        return trade_id
    except Exception as e:
        print(f"  [db] log_trade_open error: {e}")
        return None


def log_trade_close(
    db,
    *,
    trade_id: int,
    qty: int,
    entry_price: float,
    exit_price: float,
    exit_order_id: Optional[str] = None,
    status: str = "closed",
    notes: str = "",
) -> None:
    """Update an open trade with exit details and realized P&L."""
    try:
        pnl     = round((exit_price - entry_price) * qty, 4)
        pnl_pct = round((exit_price / entry_price - 1) * 100, 4) if entry_price > 0 else 0.0
        now     = datetime.now(timezone.utc).isoformat()
        db.table("intraday_trades").update({
            "exit_price":    round(exit_price, 4),
            "exit_time":     now,
            "pnl":           pnl,
            "pnl_pct":       pnl_pct,
            "status":        status,
            "notes":         notes,
            "exit_order_id": exit_order_id,
            "updated_at":    now,
        }).eq("id", trade_id).execute()
        print(f"  [db] closed trade id={trade_id} — {status}, P&L ${pnl:+.2f} ({pnl_pct:+.2f}%)")
    except Exception as e:
        print(f"  [db] log_trade_close error: {e}")


def calc_position_qty(account: dict, price: float) -> int:
    """Compute how many shares to buy given account buying power and price."""
    if price <= 0:
        return 0
    buying_power = float(account.get("buying_power", 0) or 0)
    dollar_alloc = min(buying_power * MAX_POSITION_PCT, MAX_POSITION_USD)
    if dollar_alloc < MIN_TRADE_USD:
        return 0
    return int(dollar_alloc / price)
