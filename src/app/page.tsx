import { Suspense } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { WatchlistWidget } from "@/components/dashboard/WatchlistWidget";
import { PortfolioWidget } from "@/components/dashboard/PortfolioWidget";
import { OrdersWidget } from "@/components/dashboard/OrdersWidget";
import { AlertsWidget } from "@/components/dashboard/AlertsWidget";
import { BudgetHistoryWidget } from "@/components/dashboard/BudgetHistoryWidget";
import { WidgetSkeleton } from "@/components/dashboard/WidgetSkeleton";

export const dynamic = "force-dynamic";

const WIDGETS = [
  { id: "watchlist", Widget: WatchlistWidget },
  { id: "portfolio", Widget: PortfolioWidget },
  { id: "orders", Widget: OrdersWidget },
  { id: "alerts", Widget: AlertsWidget },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen">
      <AutoRefresh intervalMs={60_000} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Live overview · auto-refreshes every 60s
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BudgetHistoryWidget />

          {WIDGETS.map(({ id, Widget }) => (
            <Suspense key={id} fallback={<WidgetSkeleton />}>
              <Widget />
            </Suspense>
          ))}
        </div>
      </main>
    </div>
  );
}
