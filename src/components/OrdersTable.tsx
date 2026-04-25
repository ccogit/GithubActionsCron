"use client";

import { X } from "lucide-react";
import { format } from "date-fns";
import { cancelOrderAction } from "@/app/alpaca-actions";
import type { AlpacaOrder } from "@/lib/alpaca";

const TERMINAL = new Set(["filled", "canceled", "expired", "rejected", "done_for_day"]);

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    filled: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    partially_filled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    new: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    accepted: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    pending_new: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    held: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    canceled: "bg-white/5 text-muted-foreground border-white/10",
    expired: "bg-white/5 text-muted-foreground border-white/10",
    rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const cls =
    classes[status] ?? "bg-white/5 text-muted-foreground border-white/10";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function OrdersTable({ orders }: { orders: AlpacaOrder[] }) {
  if (orders.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground font-mono">
        No orders
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/6">
            {["Symbol", "Side", "Type", "Qty", "Filled", "Limit", "Status", "Created", ""].map((h) => (
              <th
                key={h}
                className={`py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground ${
                  h === "Symbol" || h === "Side" || h === "Status" || h === ""
                    ? "text-left"
                    : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/4">
          {orders.map((order) => (
            <tr key={order.id} className="group hover:bg-white/2 transition-colors">
              <td className="py-3 px-3 font-mono font-bold text-foreground">
                {order.symbol}
              </td>
              <td className="py-3 px-3">
                <span
                  className={`font-mono text-xs font-semibold ${
                    order.side === "buy" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {order.side.toUpperCase()}
                </span>
              </td>
              <td className="py-3 px-3 text-right font-mono text-xs text-muted-foreground uppercase">
                {order.type}
              </td>
              <td className="py-3 px-3 text-right font-mono tabular-nums">
                {order.qty}
              </td>
              <td className="py-3 px-3 text-right font-mono tabular-nums text-muted-foreground">
                {order.filled_qty}
              </td>
              <td className="py-3 px-3 text-right font-mono tabular-nums text-muted-foreground">
                {order.limit_price
                  ? `$${parseFloat(order.limit_price).toFixed(2)}`
                  : "—"}
              </td>
              <td className="py-3 px-3">
                <StatusBadge status={order.status} />
              </td>
              <td className="py-3 px-3 text-right font-mono text-xs text-muted-foreground">
                {format(new Date(order.created_at), "MMM d, HH:mm")}
              </td>
              <td className="py-3 px-2">
                {!TERMINAL.has(order.status) && (
                  <button
                    type="button"
                    onClick={() => cancelOrderAction(order.id)}
                    title="Cancel order"
                    className="h-7 w-7 rounded-md flex items-center justify-center opacity-20 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
