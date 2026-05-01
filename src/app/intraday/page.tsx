import { createClient } from "@/lib/supabase/server";
import { IntraDayDashboard } from "@/components/IntraDayDashboard";

export const dynamic = "force-dynamic";

const ENDPOINT = "https://paper-api.alpaca.markets/v2";

function hdrs(): Record<string, string> {
  return {
    "APCA-API-KEY-ID":     process.env.INTRADAY_ALPACA_KEY    ?? "",
    "APCA-API-SECRET-KEY": process.env.INTRADAY_ALPACA_SECRET ?? "",
  };
}

async function fetchPositions() {
  try {
    const res = await fetch(`${ENDPOINT}/positions`, { headers: hdrs(), cache: "no-store" });
    return res.ok ? res.json() : [];
  } catch { return []; }
}

async function fetchAccount() {
  try {
    const res = await fetch(`${ENDPOINT}/account`, { headers: hdrs(), cache: "no-store" });
    return res.ok ? res.json() : {};
  } catch { return {}; }
}

export default async function IntraDayPage() {
  const hasCredentials = !!(
    process.env.INTRADAY_ALPACA_KEY && process.env.INTRADAY_ALPACA_SECRET
  );

  const db    = createClient();
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const [positions, account, tradesRes] = await Promise.all([
    hasCredentials ? fetchPositions() : Promise.resolve([]),
    hasCredentials ? fetchAccount()   : Promise.resolve({}),
    db
      .from("intraday_trades")
      .select("*")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">
              Alpaca · Intraday Paper Account
            </h2>
            <h1 className="text-xl font-semibold text-foreground">Intraday Strategies</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Breakout · VWAP · Mean Reversion · Portfolio — runs every minute during market hours
            </p>
          </div>
        </div>

        {!hasCredentials && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm">
            <p className="font-medium text-amber-400 mb-1">Alpaca credentials not configured</p>
            <p className="text-muted-foreground text-xs">
              Add <code className="font-mono text-amber-300">INTRADAY_ALPACA_KEY</code> and{" "}
              <code className="font-mono text-amber-300">INTRADAY_ALPACA_SECRET</code> as
              environment variables to enable live positions and account data.
              Trade history from Supabase is still shown below.
            </p>
          </div>
        )}

        <IntraDayDashboard
          initialPositions={positions}
          initialAccount={account}
          initialTrades={tradesRes.data ?? []}
        />
      </main>
    </div>
  );
}
