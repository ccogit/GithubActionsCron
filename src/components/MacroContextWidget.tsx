'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

interface EconomicIndicator {
  indicator: string;
  label: string;
  value: number | null;
  observation_date: string;
  fetched_at: string;
}

function MacroChip({
  label,
  value,
  unit,
  icon,
  status,
  statusLabel,
}: {
  label: string;
  value: number | null;
  unit: string;
  icon: React.ReactNode;
  status: 'bullish' | 'neutral' | 'bearish';
  statusLabel: string;
}) {
  if (value === null) return null;

  const statusColors = {
    bullish: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    neutral: 'bg-white/6 text-muted-foreground border-white/10',
    bearish: 'bg-red-500/15 text-red-300 border-red-500/30',
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${statusColors[status]}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground/60">{icon}</span>
        <span className="text-xs font-medium uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono font-semibold text-sm">{value.toFixed(2)}{unit}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">{statusLabel}</span>
      </div>
    </div>
  );
}

export function MacroContextWidget() {
  const [indicators, setIndicators] = useState<EconomicIndicator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/macro-context');
        if (res.ok) {
          const data = (await res.json()) as EconomicIndicator[];
          setIndicators(data);
        }
      } catch (e) {
        console.error('Failed to fetch macro context:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const fedRate = indicators.find((i) => i.indicator === 'DFF')?.value ?? null;
  const unemployment = indicators.find((i) => i.indicator === 'UNRATE')?.value ?? null;
  const cpi = indicators.find((i) => i.indicator === 'CPIAUCSL')?.value ?? null;

  const fedStatus: 'bullish' | 'neutral' | 'bearish' =
    fedRate == null ? 'neutral' : fedRate >= 5 ? 'bearish' : fedRate <= 2 ? 'bullish' : 'neutral';
  const fedLabel =
    fedRate == null ? '-' : fedRate >= 5 ? 'Restrictive' : fedRate <= 2 ? 'Accommodative' : 'Neutral';

  const uneStatus: 'bullish' | 'neutral' | 'bearish' =
    unemployment == null ? 'neutral' : unemployment >= 5 ? 'bearish' : unemployment <= 3.5 ? 'bullish' : 'neutral';
  const uneLabel =
    unemployment == null ? '-' : unemployment >= 5 ? 'Elevated' : unemployment <= 3.5 ? 'Tight' : 'Stable';

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground/50 py-2">Loading macro context...</div>
    );
  }

  return (
    <div className="space-y-3 mb-6">
      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">Economic Context</div>
      <div className="flex flex-wrap items-center gap-2">
        <MacroChip
          label="Fed Rate"
          value={fedRate}
          unit="%"
          icon={<DollarSign className="w-3 h-3" />}
          status={fedStatus}
          statusLabel={fedLabel}
        />
        <MacroChip
          label="Unemployment"
          value={unemployment}
          unit="%"
          icon={<TrendingUp className="w-3 h-3" />}
          status={uneStatus}
          statusLabel={uneLabel}
        />
        {cpi != null && (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white/6 text-muted-foreground border-white/10">
            <span className="text-xs font-medium uppercase tracking-widest">CPI</span>
            <span className="font-mono font-semibold text-sm">{cpi.toFixed(1)}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider opacity-50">YoY</span>
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
        Restrictive rates and elevated unemployment dampen bullish signals; accommodative conditions amplify them.
      </p>
    </div>
  );
}
