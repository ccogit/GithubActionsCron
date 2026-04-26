'use client';

import { useState, useEffect } from 'react';
import { Loader2, CalendarClock } from 'lucide-react';

export function RebalanceToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings/rebalance')
      .then((r) => r.json())
      .then((d) => setEnabled(d.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function toggle() {
    if (enabled === null || saving) return;
    const next = !enabled;
    setSaving(true);
    try {
      const r = await fetch('/api/settings/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const d = await r.json();
      setEnabled(d.enabled);
    } catch (e) {
      console.error('Failed to save rebalance setting:', e);
    } finally {
      setSaving(false);
    }
  }

  const loading = enabled === null;

  return (
    <div className="flex items-center gap-2.5">
      {saving ? (
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
      ) : (
        <CalendarClock className="w-3 h-3 text-muted-foreground/50" />
      )}

      <span className="text-xs text-muted-foreground">Auto-rebalance</span>

      {/* Toggle switch */}
      <button
        role="switch"
        aria-checked={enabled ?? false}
        onClick={toggle}
        disabled={loading || saving}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none disabled:opacity-40 ${
          enabled
            ? 'bg-green-500/70 border-green-500/50'
            : 'bg-white/10 border-white/15'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>

      {/* State label */}
      <span
        className={`text-[11px] tabular-nums transition-colors ${
          loading
            ? 'text-muted-foreground/40'
            : enabled
            ? 'text-green-400'
            : 'text-muted-foreground/50'
        }`}
      >
        {loading ? '…' : enabled ? 'on · weekdays 14:00 Berlin' : 'off'}
      </span>
    </div>
  );
}
