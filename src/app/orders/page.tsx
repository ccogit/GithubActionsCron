import { getOrders } from "@/lib/alpaca";
import { OrdersTable } from "@/components/OrdersTable";
import { PlaceOrderForm } from "@/components/PlaceOrderForm";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const orders = await getOrders("all", 50);

  const open = orders.filter((o) =>
    !["filled", "canceled", "expired", "rejected", "done_for_day"].includes(o.status)
  ).length;

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
            <h1 className="text-xl font-semibold text-foreground">Orders</h1>
            {orders.length > 0 && (
              <div className="flex items-center gap-4 mt-2 font-mono text-sm text-muted-foreground">
                <span>
                  {orders.length} total ·{" "}
                  <span className={open > 0 ? "text-amber-400" : "text-muted-foreground"}>
                    {open} open
                  </span>
                </span>
              </div>
            )}
          </div>
          <PlaceOrderForm />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-white/8 bg-card overflow-hidden">
          <OrdersTable orders={orders} />
        </div>

      </main>
    </div>
  );
}
