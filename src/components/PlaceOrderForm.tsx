"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { placeOrderAction } from "@/app/alpaca-actions";

type Props = {
  defaultSide?: "buy" | "sell";
};

const btnBase =
  "px-3 py-1.5 text-xs font-mono font-medium transition-colors";

export function PlaceOrderForm({ defaultSide = "buy" }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [side, setSide] = useState<"buy" | "sell">(defaultSide);
  const [type, setType] = useState<"market" | "limit">("market");

  async function handleAction(formData: FormData) {
    formData.set("side", side);
    formData.set("type", type);
    await placeOrderAction(formData);
    formRef.current?.reset();
    setSide(defaultSide);
    setType("market");
  }

  return (
    <form ref={formRef} action={handleAction} className="flex flex-wrap items-center gap-2">
      {/* Symbol */}
      <input
        name="symbol"
        placeholder="TICKER"
        required
        className="w-24 h-8 px-3 rounded-md bg-white/6 border border-white/12 text-xs font-mono uppercase placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
      />

      {/* Qty */}
      <input
        name="qty"
        type="number"
        min="0.001"
        step="0.001"
        placeholder="Qty"
        required
        className="w-20 h-8 px-3 rounded-md bg-white/6 border border-white/12 text-xs font-mono placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
      />

      {/* Side toggle */}
      <div className="flex rounded-md overflow-hidden border border-white/12">
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={`${btnBase} ${
            side === "buy"
              ? "bg-emerald-500/20 text-emerald-400 border-r border-white/12"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5 border-r border-white/12"
          }`}
        >
          BUY
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={`${btnBase} ${
            side === "sell"
              ? "bg-red-500/20 text-red-400"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          SELL
        </button>
      </div>

      {/* Type toggle */}
      <div className="flex rounded-md overflow-hidden border border-white/12">
        <button
          type="button"
          onClick={() => setType("market")}
          className={`${btnBase} ${
            type === "market"
              ? "bg-white/10 text-foreground border-r border-white/12"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5 border-r border-white/12"
          }`}
        >
          MKT
        </button>
        <button
          type="button"
          onClick={() => setType("limit")}
          className={`${btnBase} ${
            type === "limit"
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          LMT
        </button>
      </div>

      {/* Limit price */}
      {type === "limit" && (
        <input
          name="limit_price"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Limit $"
          required
          className="w-24 h-8 px-3 rounded-md bg-white/6 border border-white/12 text-xs font-mono placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
        />
      )}

      {/* Submit */}
      <button
        type="submit"
        className="h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/25 hover:border-primary/50 transition-all flex items-center gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Place Order
      </button>
    </form>
  );
}
