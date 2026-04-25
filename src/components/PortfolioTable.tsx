"use client";

import { X } from "lucide-react";
import { closePositionAction } from "@/app/alpaca-actions";
import type { AlpacaPosition } from "@/lib/alpaca";

export function PortfolioTable({ positions }: { positions: AlpacaPosition[] }) {
  if (positions.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground font-mono">
        No open positions
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/6">
            {["Symbol", "Side", "Qty", "Avg Entry", "Current", "Mkt Value", "Unrealized P&L", ""].map((h) => (
              <th
                key={h}
                className={`py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground ${
                  h === "Symbol" || h === "" ? "text-left" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/4">
          {positions.map((pos) => {
            const pl = parseFloat(pos.unrealized_pl);
            const plpc = parseFloat(pos.unrealized_plpc) * 100;
            const isLong = pos.side === "long";
            const qty = parseFloat(pos.qty);

            return (
              <tr key={pos.symbol} className="group hover:bg-white/2 transition-colors">
                <td className="py-3 px-3 font-mono font-bold text-foreground">
                  {pos.symbol}
                </td>
                <td className="py-3 px-3 text-right">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${
                      isLong
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border-red-500/20"
                    }`}
                  >
                    {pos.side.toUpperCase()}
                  </span>
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums">
                  {qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(4)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-muted-foreground">
                  ${parseFloat(pos.avg_entry_price).toFixed(2)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                  ${parseFloat(pos.current_price).toFixed(2)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums">
                  ${parseFloat(pos.market_value).toFixed(2)}
                </td>
                <td className="py-3 px-3 text-right">
                  <div
                    className={`font-mono tabular-nums text-sm ${
                      pl >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {pl >= 0 ? "+" : ""}${pl.toFixed(2)}
                    <span className="text-xs ml-1 opacity-70">
                      ({plpc >= 0 ? "+" : ""}{plpc.toFixed(2)}%)
                    </span>
                  </div>
                </td>
                <td className="py-3 px-2">
                  <button
                    type="button"
                    onClick={() => closePositionAction(pos.symbol)}
                    title="Close position"
                    className="h-7 w-7 rounded-md flex items-center justify-center opacity-20 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
