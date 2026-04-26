"use client";

import { AttractivenessResult, SignalContribution } from "@/lib/attractiveness";

interface AttractivenessBreakdownProps {
  result: AttractivenessResult;
  symbol: string;
}

export function AttractivenessBreakdown({ result, symbol }: AttractivenessBreakdownProps) {
  const signalsByContribution = result.signals.sort((a, b) => {
    // Sort by: non-zero contributions first, then by absolute contribution descending
    const aAbsolute = Math.abs(a.contribution);
    const bAbsolute = Math.abs(b.contribution);
    if (aAbsolute !== bAbsolute) return bAbsolute - aAbsolute;
    return b.contribution - a.contribution;
  });

  const positiveSignals = signalsByContribution.filter((s) => s.contribution > 0);
  const negativeSignals = signalsByContribution.filter((s) => s.contribution < 0);
  const neutralSignals = signalsByContribution.filter((s) => s.contribution === 0);

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">{symbol} Attractiveness</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-blue-600">{result.score}</span>
          <span className="text-sm text-gray-500">
            ({result.signalCount} signals)
          </span>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex gap-2">
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
              result.outlook === "bullish"
                ? "bg-green-100 text-green-800"
                : result.outlook === "bearish"
                  ? "bg-red-100 text-red-800"
                  : "bg-gray-100 text-gray-800"
            }`}
          >
            {result.outlook.charAt(0).toUpperCase() + result.outlook.slice(1)}
          </span>
        </div>
        {result.reasons.length > 0 && (
          <div className="text-sm text-gray-600">
            <p className="mb-2 font-medium">Key reasons:</p>
            <ul className="list-inside list-disc space-y-1">
              {result.reasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {positiveSignals.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-green-700">
              Bullish Signals (+{positiveSignals.reduce((sum, s) => sum + s.contribution, 0)})
            </h4>
            <div className="space-y-2">
              {positiveSignals.map((signal) => (
                <SignalRow key={signal.name} signal={signal} />
              ))}
            </div>
          </div>
        )}

        {negativeSignals.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-red-700">
              Bearish Signals ({negativeSignals.reduce((sum, s) => sum + s.contribution, 0)})
            </h4>
            <div className="space-y-2">
              {negativeSignals.map((signal) => (
                <SignalRow key={signal.name} signal={signal} />
              ))}
            </div>
          </div>
        )}

        {neutralSignals.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-gray-600">
              Neutral / Insufficient Data
            </h4>
            <div className="space-y-2">
              {neutralSignals.map((signal) => (
                <SignalRow key={signal.name} signal={signal} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-gray-200 pt-3 text-xs text-gray-500">
        <p className="mb-2 font-medium">Score Range:</p>
        <p>
          Minimum: −11 (all bearish) | Maximum: +12 (all bullish) | Threshold for outlook:
          ±3
        </p>
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: SignalContribution }) {
  const colors = {
    positive: "bg-green-50 border-l-4 border-green-400",
    negative: "bg-red-50 border-l-4 border-red-400",
    neutral: "bg-gray-50 border-l-4 border-gray-300",
  };

  const type =
    signal.contribution > 0 ? "positive" : signal.contribution < 0 ? "negative" : "neutral";

  return (
    <div className={`${colors[type]} rounded-sm p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="font-medium text-gray-900">{signal.name}</div>
          <div className="text-xs text-gray-600">{signal.description}</div>
        </div>
        <div className="text-right">
          <div
            className={`font-semibold ${
              signal.contribution > 0
                ? "text-green-700"
                : signal.contribution < 0
                  ? "text-red-700"
                  : "text-gray-700"
            }`}
          >
            {signal.contribution > 0 ? "+" : ""}{signal.contribution}
          </div>
          <div className="text-xs text-gray-600">{signal.value}</div>
        </div>
      </div>
    </div>
  );
}
