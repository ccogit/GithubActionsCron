'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { TrendingUp, Activity, Landmark, Bell, Compass } from 'lucide-react';
import { AnalystsView } from '@/components/market/AnalystsView';
import { InvestorsView } from '@/components/market/InvestorsView';
import { PoliticianTrades } from '@/components/PoliticianTrades';
import { AlertsTable } from '@/components/AlertsTable';
import { MarketTable } from '@/components/MarketTable';
import type { AlertLogRow } from '@/lib/types';

type TabId = 'analysts' | 'investors' | 'politicians' | 'alerts' | 'explore';

interface Aggregates {
  hotStocks: any[];
  topMovers: any[];
  earnings: any[];
}

function TabButton({
  id,
  active,
  onSelect,
  icon,
  label,
  badge,
}: {
  id: TabId;
  active: TabId;
  onSelect: (id: TabId) => void;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onSelect(id)}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
        isActive
          ? 'border-b-2 border-blue-500 text-blue-400 -mb-px'
          : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
      {typeof badge === 'number' && badge > 0 && (
        <span className="text-[10px] font-mono bg-white/10 text-muted-foreground px-1.5 py-0.5 rounded">
          {badge}
        </span>
      )}
    </button>
  );
}

export function MarketTabs({ alerts }: { alerts: AlertLogRow[] }) {
  const [active, setActive] = useState<TabId>('analysts');
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);

  useEffect(() => {
    if (active === 'analysts' || active === 'investors') {
      if (aggregates) return;
      fetch('/api/market-aggregates')
        .then((r) => r.json())
        .then(setAggregates)
        .catch((e) => console.error('Failed to fetch aggregates:', e));
    }
  }, [active, aggregates]);

  return (
    <section>
      {/* Tab nav — participants left, utility right */}
      <div className="flex items-end border-b border-white/10 overflow-x-auto">
        <div className="flex">
          <TabButton
            id="analysts"
            active={active}
            onSelect={setActive}
            icon={<TrendingUp className="w-4 h-4" />}
            label="Analysts"
          />
          <TabButton
            id="investors"
            active={active}
            onSelect={setActive}
            icon={<Activity className="w-4 h-4" />}
            label="Investors"
          />
          <TabButton
            id="politicians"
            active={active}
            onSelect={setActive}
            icon={<Landmark className="w-4 h-4" />}
            label="Politicians"
          />
        </div>
        <div className="flex-1" />
        <div className="flex">
          <TabButton
            id="alerts"
            active={active}
            onSelect={setActive}
            icon={<Bell className="w-4 h-4" />}
            label="Alerts"
            badge={alerts.length}
          />
          <TabButton
            id="explore"
            active={active}
            onSelect={setActive}
            icon={<Compass className="w-4 h-4" />}
            label="Explore"
          />
        </div>
      </div>

      {/* Tab content */}
      <div className="pt-6 min-h-[200px]">
        {active === 'analysts' &&
          (aggregates ? (
            <AnalystsView hotStocks={aggregates.hotStocks} />
          ) : (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ))}

        {active === 'investors' &&
          (aggregates ? (
            <InvestorsView topMovers={aggregates.topMovers} earnings={aggregates.earnings} />
          ) : (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ))}

        {active === 'politicians' && <PoliticianTrades />}

        {active === 'alerts' && (
          <div className="rounded-lg border border-white/8 bg-card overflow-hidden">
            <AlertsTable alerts={alerts} />
          </div>
        )}

        {active === 'explore' && <MarketTable />}
      </div>
    </section>
  );
}
