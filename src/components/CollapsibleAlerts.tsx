"use client";

import { useState } from "react";
import { ChevronDown, Bell } from "lucide-react";
import { AlertsTable } from "@/components/AlertsTable";
import type { AlertLogRow } from "@/lib/types";

export function CollapsibleAlerts({ alerts }: { alerts: AlertLogRow[] }) {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between group mb-0"
      >
        <div className="flex items-center gap-2">
          <Bell className="h-3 w-3 text-muted-foreground/60" />
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Recent Alerts
          </span>
          {alerts.length > 0 && (
            <span className="text-[10px] font-mono bg-white/8 text-muted-foreground px-1.5 py-0.5 rounded">
              {alerts.length}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-4 rounded-lg border border-white/8 bg-card overflow-hidden">
          <AlertsTable alerts={alerts} />
        </div>
      )}
    </section>
  );
}
