import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WatchlistTable } from "@/components/WatchlistTable";
import { AddSymbolForm } from "@/components/AddSymbolForm";
import { AlertsTable } from "@/components/AlertsTable";
import { PriceChart } from "@/components/PriceChart";
import type { WatchlistRow, PriceTick, AlertLogRow } from "@/lib/types";

export const revalidate = 60;

export default async function Home() {
  const db = await createClient();

  const [watchlistRes, ticksRes, alertsRes] = await Promise.all([
    db.from("watchlist").select("*").order("created_at"),
    db
      .from("price_ticks")
      .select("*")
      .gte("fetched_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order("fetched_at"),
    db.from("alert_log").select("*").order("sent_at", { ascending: false }).limit(20),
  ]);

  const watchlist: WatchlistRow[] = watchlistRes.data ?? [];
  const ticks: PriceTick[] = ticksRes.data ?? [];
  const alerts: AlertLogRow[] = alertsRes.data ?? [];

  const latestPrices: Record<string, number> = {};
  for (const tick of ticks) {
    latestPrices[tick.symbol] = tick.price;
  }

  const symbols = watchlist.map((r) => r.symbol);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Watcher</h1>
        <p className="text-muted-foreground text-sm">
          Prices fetched every minute. Alerts sent to christopher.ridder@gmail.com.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Watchlist</CardTitle>
          <AddSymbolForm />
        </CardHeader>
        <CardContent>
          <WatchlistTable watchlist={watchlist} latestPrices={latestPrices} />
        </CardContent>
      </Card>

      {symbols.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Price History (last 2 hours)</CardTitle>
          </CardHeader>
          <CardContent>
            <PriceChart ticks={ticks} symbols={symbols} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <AlertsTable alerts={alerts} />
        </CardContent>
      </Card>
    </main>
  );
}
