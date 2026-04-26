'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Check, AlertTriangle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

type RunState = 'queued' | 'running' | 'completed' | 'failed';

interface WorkflowEntry {
  workflow: string;
  name: string;
  dispatchedAt: string;
  runState: RunState;
  dispatchError?: string;
  conclusion?: string;
}

const TERMINAL: ReadonlySet<RunState> = new Set(['completed', 'failed']);

function overallState(workflows: Map<string, WorkflowEntry>): 'idle' | 'amber' | 'green' | 'red' {
  if (workflows.size === 0) return 'idle';
  const all = Array.from(workflows.values());
  if (all.some((w) => !TERMINAL.has(w.runState))) return 'amber';
  return all.some((w) => w.runState === 'failed') ? 'red' : 'green';
}

export function RefreshSignalsButton() {
  const [streaming, setStreaming] = useState(false);
  const [streamDone, setStreamDone] = useState(false);
  const [workflows, setWorkflows] = useState<Map<string, WorkflowEntry>>(new Map());
  const [expanded, setExpanded] = useState(false);

  // Always-current reference so polling closure never goes stale
  const latestWorkflows = useRef(workflows);
  latestWorkflows.current = workflows;
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const patchWorkflow = useCallback((key: string, patch: Partial<WorkflowEntry>) => {
    setWorkflows((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing) next.set(key, { ...existing, ...patch });
      return next;
    });
  }, []);

  // Start polling once all dispatches have been sent
  useEffect(() => {
    if (!streamDone) return;

    const poll = async () => {
      const toCheck = Array.from(latestWorkflows.current.entries()).filter(
        ([, w]) => !TERMINAL.has(w.runState) && !w.dispatchError
      );

      if (toCheck.length === 0) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        return;
      }

      await Promise.all(
        toCheck.map(async ([key, wf]) => {
          try {
            const res = await fetch(
              `/api/workflow-status?workflow=${encodeURIComponent(wf.workflow)}&since=${encodeURIComponent(wf.dispatchedAt)}`
            );
            const data = await res.json();
            if (data.state && data.state !== wf.runState) {
              patchWorkflow(key, { runState: data.state as RunState, conclusion: data.conclusion });
            }
          } catch {
            // network hiccup — try again next interval
          }
        })
      );
    };

    poll(); // immediate first check
    pollingRef.current = setInterval(poll, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [streamDone, patchWorkflow]);

  async function trigger() {
    // Clear previous run and stop any in-progress polling
    setStreaming(true);
    setStreamDone(false);
    setWorkflows(new Map());

    try {
      const res = await fetch('/api/trigger-refresh', { method: 'POST' });
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'dispatched') {
              const entry: WorkflowEntry = {
                workflow: ev.workflow,
                name: ev.name,
                dispatchedAt: ev.dispatchedAt,
                runState: ev.ok ? 'queued' : 'failed',
                dispatchError: ev.error,
              };
              setWorkflows((prev) => new Map(prev).set(ev.workflow, entry));
            }
          } catch {
            // malformed JSON line — skip
          }
        }
      }
    } catch (e) {
      // surface catastrophic network failure as a pseudo-entry
      setWorkflows((prev) => {
        if (prev.size > 0) return prev; // partial progress already shown
        return new Map([
          ['__error__', {
            workflow: '__error__',
            name: 'Network error',
            dispatchedAt: new Date().toISOString(),
            runState: 'failed',
            dispatchError: String(e),
          }],
        ]);
      });
    } finally {
      setStreaming(false);
      setStreamDone(true);
    }
  }

  const state = streaming ? 'amber' : overallState(workflows);
  const hasWorkflows = workflows.size > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Main trigger button */}
        <button
          type="button"
          onClick={trigger}
          disabled={state === 'amber'}
          className={`h-7 px-3 rounded-md flex items-center gap-1.5 text-[11px] font-medium border transition-colors disabled:cursor-not-allowed ${
            state === 'idle'
              ? 'text-muted-foreground bg-white/5 hover:bg-white/10 border-white/10'
              : state === 'amber'
              ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
              : state === 'green'
              ? 'text-green-400 bg-green-500/10 border-green-500/30 hover:bg-green-500/20'
              : 'text-red-400 bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
          }`}
        >
          {state === 'amber' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : state === 'green' ? (
            <Check className="w-3 h-3" />
          ) : state === 'red' ? (
            <AlertTriangle className="w-3 h-3" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          {state === 'amber'
            ? streaming ? 'Triggering…' : 'Running…'
            : state === 'green'
            ? 'All done'
            : state === 'red'
            ? 'Some failed'
            : 'Refresh all signals'}
        </button>

      </div>

      {/* Per-workflow detail panel */}
      {hasWorkflows && (
        <div className="rounded-lg border border-white/10 overflow-hidden w-fit min-w-64">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-medium text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-white/5 transition-colors"
          >
            <span>{workflows.size} workflows</span>
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {expanded && (
            <div className="border-t border-white/10">
              {Array.from(workflows.values()).map((wf, i, arr) => (
                <WorkflowRow
                  key={wf.workflow}
                  entry={wf}
                  borderBottom={i < arr.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkflowRow({ entry, borderBottom }: { entry: WorkflowEntry; borderBottom: boolean }) {
  const { name, runState, dispatchError } = entry;
  const isActive = runState === 'queued' || runState === 'running';

  const dotClass =
    runState === 'completed'
      ? 'bg-green-400'
      : runState === 'failed'
      ? 'bg-red-400'
      : 'bg-amber-400 animate-pulse';

  const labelClass =
    runState === 'completed'
      ? 'text-green-400/70'
      : runState === 'failed'
      ? 'text-red-400/70'
      : 'text-amber-400/70';

  const label = dispatchError
    ? 'dispatch failed'
    : runState === 'queued'
    ? 'queued'
    : runState === 'running'
    ? 'running'
    : runState === 'completed'
    ? 'done'
    : 'failed';

  return (
    <div className={`px-3 py-1.5 bg-white/[0.02] ${borderBottom ? 'border-b border-white/5' : ''}`}>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-[11px] flex-1 pr-3">{name}</span>
        <span className={`text-[10px] font-mono tabular-nums ${labelClass}`}>{label}</span>
      </div>
      {isActive && (
        <div className="mt-1 ml-3.5 h-px rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full w-2/5 rounded-full bg-amber-400/50"
            style={{ animation: 'indeterminate 1.5s ease-in-out infinite' }}
          />
        </div>
      )}
    </div>
  );
}
