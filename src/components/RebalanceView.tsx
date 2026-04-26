'use client';

import { useState } from 'react';
import {
  ArrowRight,
  AlertTriangle,
  Check,
  Loader2,
  Play,
  Eye,
  Info,
} from 'lucide-react';

interface PlannedSwap {
  sell: { symbol: string; qty: number; price: number; value: number; score: number };
  buy: { symbol: string; qty: number; price: number; value: number; score: number };
  scoreDelta: number;
}

interface RebalancePlan {
  swaps: PlannedSwap[];
  totalValueBefore: number;
  totalValueAfter: number;
  iterations: number;
  skipped: { reason: string; details?: string }[];
}

interface PreviewResponse {
  plan: RebalancePlan;
  config: {
    threshold: number;
    minBuyScore: number;
    maxIterations: number;
    minTradeUsd: number;
  };
  summary: {
    heldStocks: number;
    universeSize: number;
    symbolsScored: number;
  };
}

interface ExecutedOrder {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  ok: boolean;
  error?: string;
}

const DEFAULTS = {
  threshold: 1,
  minBuyScore: 1,
  maxIterations: 5,
  minTradeUsd: 50,
};

export function RebalanceView() {
  const [config, setConfig] = useState(DEFAULTS);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [executed, setExecuted] = useState<ExecutedOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview() {
    setPreviewing(true);
    setError(null);
    setExecuted(null);
    setConfirming(false);
    try {
      const params = new URLSearchParams({
        threshold: String(config.threshold),
        minBuyScore: String(config.minBuyScore),
        maxIterations: String(config.maxIterations),
        minTradeUsd: String(config.minTradeUsd),
      });
      const res = await fetch(`/api/rebalance?${params}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setPreview(null);
      } else {
        setPreview(data);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function execute() {
    setExecuting(true);
    setError(null);
    try {
      const res = await fetch('/api/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setExecuted(data.executed ?? []);
        setPreview(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setExecuting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
        <span>
          Sells the lowest-scored holding and buys the highest-scored non-held US stock,
          but only when the score improvement justifies the trade. Universe restricted to
          Alpaca-tradable equities.
        </span>
      </div>

      {/* Config */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <ConfigField
          label="Threshold"
          value={config.threshold}
          onChange={(v) => setConfig({ ...config, threshold: v })}
          step={0.5}
          hint="min score Δ"
        />
        <ConfigField
          label="Min buy score"
          value={config.minBuyScore}
          onChange={(v) => setConfig({ ...config, minBuyScore: v })}
          step={1}
          hint="reject buys below"
        />
        <ConfigField
          label="Max swaps"
          value={config.maxIterations}
          onChange={(v) => setConfig({ ...config, maxIterations: v })}
          step={1}
          hint="per run"
          integer
        />
        <ConfigField
          label="Min trade $"
          value={config.minTradeUsd}
          onChange={(v) => setConfig({ ...config, minTradeUsd: v })}
          step={10}
          hint="USD"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={loadPreview}
          disabled={previewing || executing}
          className="h-8 px-3 rounded-md flex items-center gap-1.5 text-xs font-medium text-foreground bg-white/5 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
        >
          {previewing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          {preview ? 'Refresh preview' : 'Preview rebalance'}
        </button>

        {preview && preview.plan.swaps.length > 0 && (
          confirming ? (
            <>
              <button
                type="button"
                onClick={execute}
                disabled={executing}
                className="h-8 px-3 rounded-md flex items-center gap-1.5 text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-colors disabled:opacity-50"
              >
                {executing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Confirm: place {preview.plan.swaps.length * 2} orders
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={executing}
                className="h-8 px-3 rounded-md flex items-center text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="h-8 px-3 rounded-md flex items-center gap-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              Execute
            </button>
          )
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-500/30 bg-red-500/10 text-red-300 text-xs rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}

      {/* Execution result */}
      {executed && (
        <ExecutionResult orders={executed} />
      )}

      {/* Preview */}
      {preview && !executed && <PreviewBlock data={preview} />}
    </div>
  );
}

function ConfigField({
  label,
  value,
  onChange,
  step,
  hint,
  integer,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  hint: string;
  integer?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        {label}
        <span className="text-muted-foreground/60 normal-case ml-1.5 tracking-normal">
          {hint}
        </span>
      </div>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const v = integer ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-full h-8 px-2 rounded-md bg-white/5 border border-white/10 focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/20 text-sm font-mono text-foreground"
      />
    </label>
  );
}

function PreviewBlock({ data }: { data: PreviewResponse }) {
  const { plan, summary } = data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>Holdings: <span className="text-foreground font-mono">{summary.heldStocks}</span></span>
        <span>Universe: <span className="text-foreground font-mono">{summary.universeSize}</span></span>
        <span>Iterations: <span className="text-foreground font-mono">{plan.iterations}</span></span>
        <span>Portfolio value: <span className="text-foreground font-mono">${plan.totalValueBefore.toFixed(0)}</span></span>
      </div>

      {plan.swaps.length === 0 ? (
        <div className="text-sm text-muted-foreground border border-white/10 rounded-lg p-4">
          No swaps justify the threshold.
          {plan.skipped.length > 0 && (
            <ul className="mt-2 text-xs space-y-0.5 text-muted-foreground/70">
              {plan.skipped.map((s, i) => (
                <li key={i}>· {s.reason}{s.details ? ` — ${s.details}` : ''}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {plan.swaps.map((swap, i) => (
            <SwapRow key={i} swap={swap} index={i + 1} />
          ))}
          {plan.skipped.length > 0 && (
            <div className="text-[11px] text-muted-foreground/70 mt-2">
              Stopped: {plan.skipped[0].reason}
              {plan.skipped[0].details ? ` — ${plan.skipped[0].details}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SwapRow({ swap, index }: { swap: PlannedSwap; index: number }) {
  return (
    <div className="border border-white/10 rounded-lg p-3 bg-card flex items-center gap-3">
      <div className="text-[10px] font-mono text-muted-foreground w-6">#{index}</div>

      {/* Sell */}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-red-400/70">Sell</div>
        <div className="font-mono font-semibold">{swap.sell.symbol}</div>
        <div className="text-[11px] text-muted-foreground">
          {swap.sell.qty} @ ${swap.sell.price.toFixed(2)} ·{' '}
          <span className="font-mono">${swap.sell.value.toFixed(0)}</span>
        </div>
        <div className="text-[10px] text-red-400/80 font-mono">
          score {swap.sell.score >= 0 ? '+' : ''}{swap.sell.score}
        </div>
      </div>

      <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />

      {/* Buy */}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-green-400/70">Buy</div>
        <div className="font-mono font-semibold">{swap.buy.symbol}</div>
        <div className="text-[11px] text-muted-foreground">
          {swap.buy.qty} @ ${swap.buy.price.toFixed(2)} ·{' '}
          <span className="font-mono">${swap.buy.value.toFixed(0)}</span>
        </div>
        <div className="text-[10px] text-green-400/80 font-mono">
          score {swap.buy.score >= 0 ? '+' : ''}{swap.buy.score}
        </div>
      </div>

      {/* Score delta */}
      <div className="shrink-0 text-right">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Δ score</div>
        <div className="text-base font-mono font-bold text-blue-400">
          +{swap.scoreDelta.toFixed(0)}
        </div>
      </div>
    </div>
  );
}

function ExecutionResult({ orders }: { orders: ExecutedOrder[] }) {
  const failed = orders.filter((o) => !o.ok);
  const ok = orders.length - failed.length;

  return (
    <div className="border border-white/10 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Check className="w-4 h-4 text-green-400" />
        <span className="font-medium">
          Placed {ok} / {orders.length} orders
        </span>
      </div>

      <div className="text-[11px] font-mono space-y-0.5 text-muted-foreground">
        {orders.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={o.ok ? 'text-green-400/80' : 'text-red-400'}>
              {o.ok ? '✓' : '✗'}
            </span>
            <span className="uppercase">{o.side}</span>
            <span className="text-foreground">{o.symbol}</span>
            <span>×{o.qty}</span>
            {o.error && <span className="text-red-400/80 truncate">{o.error}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
