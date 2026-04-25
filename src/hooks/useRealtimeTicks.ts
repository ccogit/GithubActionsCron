import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import type { PriceTick } from "@/lib/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function useRealtimeTicks(symbols: string[], initialTicks: Record<string, PriceTick[]>) {
  const [ticks, setTicks] = useState(initialTicks);
  const [latestPrices, setLatestPrices] = useState<Record<string, number>>(() => {
    const prices: Record<string, number> = {};
    for (const [symbol, symbolTicks] of Object.entries(initialTicks)) {
      if (symbolTicks.length > 0) {
        prices[symbol] = symbolTicks[symbolTicks.length - 1].price;
      }
    }
    return prices;
  });

  useEffect(() => {
    if (symbols.length === 0) return;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Subscribe to new price_ticks for symbols in watchlist
    const channel = supabase
      .channel("price_ticks_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "price_ticks",
          filter: `symbol=in.(${symbols.map((s) => `"${s}"`).join(",")})`,
        },
        (payload) => {
          const newTick = payload.new as PriceTick;
          const symbol = newTick.symbol;

          // Update ticks
          setTicks((prev) => ({
            ...prev,
            [symbol]: [...(prev[symbol] ?? []), newTick],
          }));

          // Update latest price
          setLatestPrices((prev) => ({
            ...prev,
            [symbol]: newTick.price,
          }));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[Realtime] subscribed to price_ticks for ${symbols.length} symbols`);
        } else if (status === "CHANNEL_ERROR") {
          console.error("[Realtime] subscription error");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [symbols]);

  return { ticks, latestPrices };
}
