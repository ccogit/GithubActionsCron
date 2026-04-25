import Link from "next/link";
import { ArrowUpRight, Briefcase } from "lucide-react";
import { getPositions } from "@/lib/alpaca";

const ACCENT = "#3b82f6";

export async function PortfolioWidget() {
  const positions = await getPositions();

  const totalValue = positions.reduce((s, p) => s + parseFloat(p.market_value), 0);
  const totalPL = positions.reduce((s, p) => s + parseFloat(p.unrealized_pl), 0);
  const totalPLpc =
    totalValue > 0 ? (totalPL / (totalValue - totalPL)) * 100 : 0;

  const preview = [...positions]
    .sort((a, b) => Math.abs(parseFloat(b.market_value)) - Math.abs(parseFloat(a.market_value)))
    .slice(0, 4);

  return (
    <Link
      href="/portfolio"
      className="group block rounded-lg border border-white/8 bg-card hover:border-white/16 transition-colors p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5" style={{ color: ACCENT }} />
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Portfolio
          </span>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
      </div>

      {/* Key metric */}
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-mono font-semibold text-foreground tabular-nums">
          {positions.length}
        </span>
        <span className="text-sm text-muted-foreground">
          position{positions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {positions.length > 0 && (
        <div className="flex items-center gap-3 mb-4 font-mono text-sm">
          <span className="text-muted-foreground tabular-nums">
            ${totalValue.toFixed(2)}
          </span>
          <span
            className={`font-semibold tabular-nums ${
              totalPL >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {totalPL >= 0 ? "+" : ""}${totalPL.toFixed(2)}{" "}
            <span className="text-xs opacity-70">
              ({totalPLpc >= 0 ? "+" : ""}{totalPLpc.toFixed(2)}%)
            </span>
          </span>
        </div>
      )}

      {/* Preview rows */}
      <div className="space-y-2">
        {preview.map((pos) => {
          const pl = parseFloat(pos.unrealized_pl);
          return (
            <div key={pos.symbol} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold" style={{ color: ACCENT }}>
                  {pos.symbol}
                </span>
                <span
                  className={`text-xs font-mono ${
                    pos.side === "long" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {pos.side.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  ${parseFloat(pos.market_value).toFixed(2)}
                </span>
                <span
                  className={`font-mono text-xs tabular-nums ${
                    pl >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {pl >= 0 ? "+" : ""}${pl.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
        {positions.length === 0 && (
          <p className="text-xs text-muted-foreground font-mono">No open positions</p>
        )}
        {positions.length > 4 && (
          <p className="text-xs text-muted-foreground font-mono pt-1">
            +{positions.length - 4} more
          </p>
        )}
      </div>
    </Link>
  );
}
