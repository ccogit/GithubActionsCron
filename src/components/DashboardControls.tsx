'use client';

import { useState } from 'react';
import { Scale, ChevronDown, X } from 'lucide-react';
import { RefreshSignalsButton } from '@/components/RefreshSignalsButton';
import { RebalanceToggle } from '@/components/RebalanceToggle';
import { RebalanceView } from '@/components/RebalanceView';

export function DashboardControls() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      {/* Single action strip: signals refresh left, rebalance controls right */}
      <div className="flex items-start justify-between gap-4">
        <RefreshSignalsButton />

        <div className="flex items-center gap-2.5 shrink-0">
          <RebalanceToggle />

          <div className="w-px h-4 bg-white/10 self-center" />

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`h-7 px-3 rounded-md flex items-center gap-1.5 text-[11px] font-medium border transition-colors ${
              open
                ? 'text-blue-400 bg-blue-500/10 border-blue-500/30'
                : 'text-muted-foreground bg-white/5 hover:bg-white/10 border-white/10'
            }`}
          >
            <Scale className="w-3 h-3" />
            Rebalance portfolio
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Inline rebalance panel — above the portfolio, below controls */}
      {open && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/8 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-300/80">
              <Scale className="w-3.5 h-3.5" />
              Portfolio Rebalance
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/8 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-4 py-4">
            <RebalanceView />
          </div>
        </div>
      )}
    </div>
  );
}
