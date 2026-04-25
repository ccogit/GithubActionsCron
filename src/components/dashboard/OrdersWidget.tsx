import Link from "next/link";
import { ArrowUpRight, ListOrdered } from "lucide-react";
import { getOrders } from "@/lib/alpaca";

const ACCENT = "#f59e0b";
const TERMINAL = new Set(["filled", "canceled", "expired", "rejected", "done_for_day"]);

export async function OrdersWidget() {
  const orders = await getOrders("all", 20);

  const open = orders.filter((o) => !TERMINAL.has(o.status));
  const preview = orders.slice(0, 4);

  return (
    <Link
      href="/orders"
      className="group block rounded-lg border border-white/8 bg-card hover:border-white/16 transition-colors p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-3.5 w-3.5" style={{ color: ACCENT }} />
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Orders
          </span>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
      </div>

      {/* Key metric */}
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-mono font-semibold text-foreground">
          {open.length}
        </span>
        <span className="text-sm text-muted-foreground">open</span>
        {orders.length > 0 && (
          <span className="text-xs text-muted-foreground font-mono ml-1">
            · {orders.length} total
          </span>
        )}
      </div>

      {/* Preview rows */}
      <div className="space-y-2">
        {preview.map((order) => {
          const isTerminal = TERMINAL.has(order.status);
          return (
            <div key={order.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-sm font-semibold ${
                    isTerminal ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {order.symbol}
                </span>
                <span
                  className={`text-xs font-mono ${
                    order.side === "buy" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {order.side.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  ×{order.qty}
                </span>
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                    order.status === "filled"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : isTerminal
                      ? "bg-white/5 text-muted-foreground border-white/8"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  }`}
                >
                  {order.status}
                </span>
              </div>
            </div>
          );
        })}
        {orders.length === 0 && (
          <p className="text-xs text-muted-foreground font-mono">No orders yet</p>
        )}
        {orders.length > 4 && (
          <p className="text-xs text-muted-foreground font-mono pt-1">
            +{orders.length - 4} more
          </p>
        )}
      </div>
    </Link>
  );
}
