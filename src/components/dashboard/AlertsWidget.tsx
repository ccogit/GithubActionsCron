import Link from "next/link";
import { ArrowUpRight, Bell } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";

const ACCENT = "#ef4444";

export async function AlertsWidget() {
  const db = await createClient();
  const { data } = await db
    .from("alert_log")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(20);

  const alerts = data ?? [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = alerts.filter((a) => new Date(a.sent_at).getTime() > cutoff);
  const preview = alerts.slice(0, 4);

  return (
    <Link
      href="/watchlist"
      className="group block rounded-lg border border-white/8 bg-card hover:border-white/16 transition-colors p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5" style={{ color: ACCENT }} />
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Alerts
          </span>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
      </div>

      {/* Key metric */}
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-mono font-semibold text-foreground">
          {recent.length}
        </span>
        <span className="text-sm text-muted-foreground">in last 24h</span>
        {alerts.length > 0 && (
          <span className="text-xs text-muted-foreground font-mono ml-1">
            · {alerts.length} total
          </span>
        )}
      </div>

      {/* Preview rows */}
      <div className="space-y-3">
        {preview.map((alert) => (
          <div key={alert.id} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-red-400">
                  {alert.symbol}
                </span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  ${Number(alert.price).toFixed(2)} &lt; ${Number(alert.min_price).toFixed(2)}
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {format(new Date(alert.sent_at), "MMM d, HH:mm")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {alert.email_sent != null && (
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                  alert.email_sent
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border-red-500/20"
                }`}>
                  {alert.email_sent ? "email sent" : "email failed"}
                </span>
              )}
              {alert.order_placed ? (
                <span className="text-xs font-mono px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">
                  {alert.order_id
                    ? `sold · ${String(alert.order_id).slice(0, 8)}`
                    : "sold"}
                </span>
              ) : alert.order_placed != null && (
                <span className="text-xs font-mono px-1.5 py-0.5 rounded border bg-white/5 text-muted-foreground border-white/8">
                  no position
                </span>
              )}
            </div>
          </div>
        ))}
        {alerts.length === 0 && (
          <p className="text-xs text-muted-foreground font-mono">No alerts triggered yet</p>
        )}
        {alerts.length > 4 && (
          <p className="text-xs text-muted-foreground font-mono pt-1">
            +{alerts.length - 4} more
          </p>
        )}
      </div>
    </Link>
  );
}
