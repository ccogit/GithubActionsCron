"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, ShoppingCart } from "lucide-react";
import { addSymbol } from "@/app/actions";
import { placeOrderAction } from "@/app/alpaca-actions";

export function AddStockForms() {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      <WatchForm />
      <span className="text-muted-foreground/30 font-mono text-xs mt-2 select-none">·</span>
      <BuyForm />
    </div>
  );
}

function WatchForm() {
  const [state, action] = useActionState(addSymbol, { error: null });
  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action} className="flex items-center gap-2">
        <input
          name="symbol"
          placeholder="TICKER"
          required
          className="w-24 h-8 px-3 rounded-md bg-white/6 border border-white/12 text-xs font-mono uppercase placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
        />
        <input
          name="min_price"
          type="number"
          step="0.01"
          min="0"
          placeholder="Alert at"
          className="w-24 h-8 px-3 rounded-md bg-white/6 border border-white/12 text-xs font-mono placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
        />
        <WatchSubmit />
      </form>
      {state?.error && (
        <p className="text-xs text-red-400 font-mono">{state.error}</p>
      )}
    </div>
  );
}

function WatchSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/25 hover:border-primary/50 transition-all flex items-center gap-1.5 disabled:opacity-50"
    >
      <Eye className="h-3.5 w-3.5" />
      {pending ? "Adding…" : "Watch"}
    </button>
  );
}

function BuyForm() {
  async function handleBuy(fd: FormData) {
    fd.set("side", "buy");
    fd.set("type", "market");
    await placeOrderAction(fd);
  }
  return (
    <form action={handleBuy} className="flex items-center gap-2">
      <input
        name="symbol"
        placeholder="TICKER"
        required
        className="w-24 h-8 px-3 rounded-md bg-white/6 border border-white/12 text-xs font-mono uppercase placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:border-blue-400/60 focus:ring-1 focus:ring-blue-500/30 transition-all"
      />
      <input
        name="qty"
        type="number"
        step="1"
        min="1"
        placeholder="Qty"
        required
        className="w-20 h-8 px-3 rounded-md bg-white/6 border border-white/12 text-xs font-mono placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:border-blue-400/60 focus:ring-1 focus:ring-blue-500/30 transition-all"
      />
      <BuySubmit />
    </form>
  );
}

function BuySubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-8 px-3 rounded-md bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-medium hover:bg-blue-500/25 hover:border-blue-500/50 transition-all flex items-center gap-1.5 disabled:opacity-50"
    >
      <ShoppingCart className="h-3.5 w-3.5" />
      {pending ? "Buying…" : "Buy"}
    </button>
  );
}
