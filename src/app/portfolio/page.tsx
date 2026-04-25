import { getPositions } from "@/lib/alpaca";
import { PortfolioTable } from "@/components/PortfolioTable";
import { PlaceOrderForm } from "@/components/PlaceOrderForm";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const positions = await getPositions();

  const totalValue = positions.reduce(
    (sum, p) => sum + parseFloat(p.market_value),
    0
  );
  const totalPL = positions.reduce(
    (sum, p) => sum + parseFloat(p.unrealized_pl),
    0
  );

  return (
    <div className="min-h-screen">
      <AutoRefresh intervalMs={30_000} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">
              Alpaca · Paper Trading
            </h2>
            <h1 className="text-xl font-semibold text-foreground">Portfolio</h1>
            {positions.length > 0 && (
              <div className="flex items-center gap-4 mt-2 font-mono text-sm">
                <span className="text-muted-foreground">
                  Mkt Value{" "}
                  <span className="text-foreground font-semibold">
                    ${totalValue.toFixed(2)}
                  </span>
                </span>
                <span
                  className={`font-semibold ${
                    totalPL >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {totalPL >= 0 ? "+" : ""}${totalPL.toFixed(2)} unrealized
                </span>
              </div>
            )}
          </div>
          <PlaceOrderForm defaultSide="buy" />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-white/8 bg-card overflow-hidden">
          <PortfolioTable positions={positions} />
        </div>

      </main>
    </div>
  );
}
