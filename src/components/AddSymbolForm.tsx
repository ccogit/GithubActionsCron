"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { addSymbol } from "@/app/actions";

export function AddSymbolForm() {
  const [state, action, pending] = useActionState(addSymbol, { error: null });

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action} className="flex items-center gap-2">
        <input
          name="symbol"
          placeholder="TICKER"
          required
          className="w-28 h-8 px-3 rounded-md bg-white/6 border border-white/12 text-xs font-mono uppercase placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
        />
        <input
          name="min_price"
          type="number"
          step="0.01"
          min="0"
          placeholder="Min price"
          className="w-28 h-8 px-3 rounded-md bg-white/6 border border-white/12 text-xs font-mono placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/25 hover:border-primary/50 transition-all flex items-center gap-1.5 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {pending ? "Adding…" : "Add"}
        </button>
      </form>
      {state?.error && (
        <p className="text-xs text-red-400 font-mono">{state.error}</p>
      )}
    </div>
  );
}
