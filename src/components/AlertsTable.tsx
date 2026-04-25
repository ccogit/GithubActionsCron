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
