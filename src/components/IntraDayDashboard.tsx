"use client";

import { useCallback, useEffect, useState } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";

type AlpacaPosition = {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  market_value: string;
};

type AlpacaAccount = {
  equity: string;
  buying_power: string;
  cash: string;
};

type IntraDayTrade = {
  id: number;
  symbol: string;
  strategy: string;
  qty: number;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  entry_time: string | null;
  exit_time: string | null;
  pnl: number | null;
  pnl_pct: number | null;
  status: string;
  notes: string | null;
};

interface Props {
  initialPositions: AlpacaPosition[];
  initialAccount:   AlpacaAccount;
  initialTrades:    IntraDayTrade[];
}

const STRATEGY_LABELS: Record<string, string> = {
  breakout:        "Breakout",
  vwap:            "VWAP",
  mean_reversion:  "Mean Rev.",
  portfolio:       "Portfolio",
};

const STRATEGY_COLORS: Record<string, string> = {
  breakout:        "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  vwap:            "text-blue-400 bg-blue-400/10 border-blue-400/20",
  mean_reversion:  "text-violet-400 bg-violet-400/10 border-violet-400/20",
  portfolio:       "text-amber-400 bg-amber-400/10 border-amber-400/20",
};

function pnlColor(v: number | null) {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-emerald-400" : "text-red-400";
}

function fmtUsd(v: number | string | null) {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return "—";
  return `$${Math.abs(n).toFixed(2)}`;
}

function fmtPct(v: number | string | null) {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) * 100 : v;
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function IntraDayDashboard({ initialPositions, initialAccount, initialTrades }: Props) {
  const [positions, setPositions] = useState(initialPositions);
  const [account,   setAccount]   = useState(initialAccount);
  const [trades,    setTrades]    = useState(initialTrades);

  const refresh = useCallback(async () => {
    try {
      const [posRes, tradeRes] = await Promise.all([
        fetch("/api/intraday-positions"),
        fetch("/api/intraday-trades?days=1"),
      ]);
      if (posRes.ok) {
        const d = await posRes.json();
        setPositions(d.positions ?? []);
        setAccount(d.account   ?? {});
      }
      if (tradeRes.ok) {
        const d = await tradeRes.json();
        setTrades(d.trades ?? []);
      }
    } catch {/* silent — stale data is fine */}
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Aggregate P&L per strategy from today's closed trades
  const stratStats: Record<string, { trades: number; pnl: number; wins: number }> = {};
  for (const t of trades) {
    if (!stratStats[t.strategy]) {
      stratStats[t.strategy] = { trades: 0, pnl: 0, wins: 0 };
    }
    stratStats[t.strategy].trades++;
    if (t.pnl != null) {
      stratStats[t.strategy].pnl += t.pnl;
      if (t.pnl > 0) stratStats[t.strategy].wins++;
    }
  }

  const equity       = parseFloat(account.equity       ?? "0") || 0;
  const buyingPower  = parseFloat(account.buying_power ?? "0") || 0;
  const totalUnrealizedPl = positions.reduce((s, p) => s + (parseFloat(p.unrealized_pl) || 0), 0);

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />

      {/* Account summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Equity",         value: `$${equity.toFixed(2)}` },
          { label: "Buying Power",   value: `$${buyingPower.toFixed(2)}` },
          { label: "Open Positions", value: String(positions.length) },
          {
            label: "Unrealized P&L",
            value: `${totalUnrealizedPl >= 0 ? "+" : ""}$${totalUnrealizedPl.toFixed(2)}`,
            colored: true,
            positive: totalUnrealizedPl >= 0,
          },
        ].map(({ label, value, colored, positive }) => (
          <div key={label} className="rounded-lg border border-white/8 bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-lg font-semibold font-mono ${colored ? (positive ? "text-emerald-400" : "text-red-400") : "text-foreground"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Strategy P&L summary */}
      {Object.keys(stratStats).length > 0 && (
        <div>
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Today&apos;s Strategy Performance
          </h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stratStats).map(([strat, s]) => {
              const winRate = s.trades > 0 ? Math.round((s.wins / s.trades) * 100) : 0;
              return (
                <div
                  key={strat}
                  className={`rounded-lg border px-4 py-3 min-w-[140px] ${STRATEGY_COLORS[strat] ?? "border-white/8 bg-card"}`}
                >
                  <p className="text-xs font-medium mb-1">{STRATEGY_LABELS[strat] ?? strat}</p>
                  <p className={`text-base font-semibold font-mono ${pnlColor(s.pnl)}`}>
                    {s.pnl >= 0 ? "+" : ""}${s.pnl.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {s.trades} trades · {winRate}% win
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Open positions */}
      <div>
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
          Open Positions
        </h2>
        <div className="rounded-lg border border-white/8 bg-card overflow-hidden">
          {positions.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">No open positions.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/6 text-xs text-muted-foreground">
                  {["Symbol", "Qty", "Entry", "Current", "Market Value", "Unr. P&L"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const unrPl    = parseFloat(p.unrealized_pl)   || 0;
                  const unrPlPct = parseFloat(p.unrealized_plpc) * 100 || 0;
                  return (
                    <tr key={p.symbol} className="border-b border-white/4 hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 font-medium font-mono">{p.symbol}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{p.qty}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">
                        ${parseFloat(p.avg_entry_price).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 font-mono">
                        ${parseFloat(p.current_price).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">
                        ${parseFloat(p.market_value).toFixed(2)}
                      </td>
                      <td className={`px-4 py-2.5 font-mono ${pnlColor(unrPl)}`}>
                        {unrPl >= 0 ? "+" : ""}${unrPl.toFixed(2)}
                        <span className="text-[10px] ml-1">
                          ({fmtPct(unrPlPct)})
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Trade history */}
      <div>
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
          Today&apos;s Trades
        </h2>
        <div className="rounded-lg border border-white/8 bg-card overflow-hidden">
          {trades.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">No trades today.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/6 text-xs text-muted-foreground">
                  {["Time", "Symbol", "Strategy", "Entry", "Exit", "P&L", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b border-white/4 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {fmtTime(t.entry_time)}
                    </td>
                    <td className="px-4 py-2.5 font-medium font-mono">{t.symbol}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${STRATEGY_COLORS[t.strategy] ?? "border-white/10"}`}>
                        {STRATEGY_LABELS[t.strategy] ?? t.strategy}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">
                      {fmtUsd(t.entry_price)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">
                      {t.exit_price ? fmtUsd(t.exit_price) : "—"}
                    </td>
                    <td className={`px-4 py-2.5 font-mono font-semibold ${pnlColor(t.pnl)}`}>
                      {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}$${Math.abs(t.pnl).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={t.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open:        "text-amber-400 bg-amber-400/10 border-amber-400/20",
    closed:      "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    stopped:     "text-red-400 bg-red-400/10 border-red-400/20",
    eod_closed:  "text-muted-foreground bg-white/5 border-white/10",
  };
  const labels: Record<string, string> = {
    open:       "Open",
    closed:     "Closed",
    stopped:    "Stopped",
    eod_closed: "EOD",
  };
  const cls = styles[status] ?? "text-muted-foreground border-white/10";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}
