"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  icon?: ReactNode;
  badge?: number;
  headerActions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  badge,
  headerActions,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="flex items-center gap-2 group"
        >
          {icon}
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
            {title}
          </span>
          {typeof badge === "number" && badge > 0 && (
            <span className="text-[10px] font-mono bg-white/8 text-muted-foreground px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
        {open && headerActions}
      </div>

      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}
