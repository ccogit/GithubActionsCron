"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { DerivativesResult } from "@/app/api/derivatives/route";

type Props = { symbol: string; isin?: string };

export function DerivativesPanel({ symbol, isin }: Props) {
  const [data, setData] = useState<DerivativesResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const params = new URLSearchParams({ symbol });
    if (isin) params.set("isin", isin);
    fetch(`/api/derivatives?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [symbol, isin]);

  if (loading) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground font-mono animate-pulse">
        Searching derivatives…
      </div>
    );
  }

  return (
    <div className="py-3 px-1 space-y-4">
      {/* Header row: symbol + ISIN */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Derivatives for {symbol}
        </span>
        {data?.isin && (
          <span className="text-[10px] font-mono text-muted-foreground/60 bg-white/5 px-1.5 py-0.5 rounded">
            ISIN: {data.isin}
          </span>
        )}
        {data?.source && (
          <span className="text-[10px] font-mono text-emerald-400/70">
            via {data.source}
          </span>
        )}
      </div>

      {/* Knockout table (if data available) */}
      {data?.knockouts && data.knockouts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-white/6">
                {["Type", "Barrier", "Strike", "Bid", "Ask", "Leverage", "Issuer"].map((h) => (
                  <th key={h} className="text-left py-1.5 px-2 text-[9px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/4">
              {data.knockouts.map((ko) => (
                <tr key={ko.isin} className="hover:bg-white/2">
                  <td className="py-1.5 px-2">
                    <span className={`font-semibold ${ko.type === "Call" ? "text-emerald-400" : "text-red-400"}`}>
                      {ko.type}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-foreground/80">
                    {ko.barrier != null ? ko.barrier.toFixed(2) : "—"}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-muted-foreground">
                    {ko.strike != null ? ko.strike.toFixed(2) : "—"}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-muted-foreground">
                    {ko.bid != null ? ko.bid.toFixed(4) : "—"}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-foreground/80">
                    {ko.ask != null ? ko.ask.toFixed(4) : "—"}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-amber-400">
                    {ko.leverage != null ? `${ko.leverage.toFixed(1)}×` : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-muted-foreground/70">{ko.issuer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        data?.error && (
          <p className="text-[10px] font-mono text-muted-foreground/60">{data.error}</p>
        )
      )}

      {/* Quick-access links */}
      {data?.links && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-2">
            Search on platforms
          </div>
          <div className="flex flex-wrap gap-2">
            {data.links.map(({ label, url }) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono bg-white/5 hover:bg-white/10 border border-white/8 hover:border-white/16 text-muted-foreground hover:text-foreground transition-all"
              >
                {label}
                <ExternalLink className="h-2.5 w-2.5 opacity-50" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
