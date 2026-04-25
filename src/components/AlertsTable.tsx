import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import type { AlertLogRow } from "@/lib/types";

export function AlertsTable({ alerts }: { alerts: AlertLogRow[] }) {
  if (alerts.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground font-mono">
        No alerts triggered yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/6">
            <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Symbol</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Price at Alert</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Threshold</th>
            <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Actions</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Triggered</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/4">
          {alerts.map((row) => (
            <tr key={row.id} className="hover:bg-white/2 transition-colors">
              <td className="py-3 px-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                  <span className="font-mono font-bold text-red-400">{row.symbol}</span>
                </div>
              </td>
              <td className="py-3 px-3 text-right font-mono font-semibold text-red-400 tabular-nums">
                ${row.price.toFixed(2)}
              </td>
              <td className="py-3 px-3 text-right font-mono text-muted-foreground tabular-nums">
                ${row.min_price.toFixed(2)}
              </td>
              <td className="py-3 px-3">
                <div className="flex items-center gap-1.5">
                  {row.email_sent != null && (
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                      row.email_sent
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border-red-500/20"
                    }`}>
                      {row.email_sent ? "email sent" : "email failed"}
                    </span>
                  )}
                  {row.order_placed ? (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">
                      {row.order_id ? `sold · ${row.order_id.slice(0, 8)}` : "sold"}
                    </span>
                  ) : row.order_placed != null && (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded border bg-white/5 text-muted-foreground border-white/8">
                      no position
                    </span>
                  )}
                </div>
              </td>
              <td className="py-3 px-3 text-right font-mono text-xs text-muted-foreground">
                {format(new Date(row.sent_at), "MMM d, HH:mm")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
