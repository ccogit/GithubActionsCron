'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

type Phase = 'refreshing' | 'rebalancing';

export function WorkflowStatusBadge() {
  const [phase, setPhase] = useState<Phase | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/workflow-active');
        const data = await res.json();
        setPhase(data.active ? (data.phase as Phase) : null);
      } catch {
        // ignore network hiccups
      }
    };

    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  if (!phase) return null;

  const label = phase === 'rebalancing' ? 'Rebalancing…' : 'Refreshing signals…';

  return (
    <span className="flex items-center gap-1.5 text-xs font-mono text-amber-400">
      <Loader2 className="w-3 h-3 animate-spin" />
      {label}
    </span>
  );
}
