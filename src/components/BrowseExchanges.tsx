"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MarketTable } from "@/components/MarketTable";

export function BrowseExchanges() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/8 hover:border-white/12 bg-card hover:bg-card/80 transition-colors"
      >
        <span className="text-sm font-medium">
          {open ? "Hide" : "Browse"} Full Exchange
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="rounded-lg border border-white/8 bg-card/50 p-4">
          <MarketTable />
        </div>
      )}
    </div>
  );
}
