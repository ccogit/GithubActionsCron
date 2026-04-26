'use client';

import { useState } from 'react';
import { RefreshCw, Check, AlertTriangle, Loader2 } from 'lucide-react';

interface StepResult {
  workflow: string;
  name: string;
  ok: boolean;
  error?: string;
}

type State = 'idle' | 'running' | 'done' | 'error';

export function RefreshSignalsButton() {
  const [state, setState] = useState<State>('idle');
  const [steps, setSteps] = useState<StepResult[]>([]);

  async function trigger() {
    setState('running');
    setSteps([]);
    try {
      const res = await fetch('/api/trigger-refresh', { method: 'POST' });
      const data = await res.json();
      setSteps(data.steps ?? []);
      setState(data.ok ? 'done' : 'error');
    } catch (e) {
      setSteps([{ workflow: '', name: 'Network error', ok: false, error: String(e) }]);
      setState('error');
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={trigger}
        disabled={state === 'running'}
        className="h-7 px-3 rounded-md flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground bg-white/5 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-40"
      >
        {state === 'running' ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <RefreshCw className="w-3 h-3" />
        )}
        {state === 'running' ? 'Triggering…' : 'Refresh all signals'}
      </button>

      {steps.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {steps.map((step) => (
            <span
              key={step.workflow || step.name}
              title={step.error}
              className={`flex items-center gap-1 text-[11px] font-mono ${
                step.ok ? 'text-green-400/70' : 'text-red-400/70'
              }`}
            >
              {step.ok ? (
                <Check className="w-3 h-3" />
              ) : (
                <AlertTriangle className="w-3 h-3" />
              )}
              {step.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
