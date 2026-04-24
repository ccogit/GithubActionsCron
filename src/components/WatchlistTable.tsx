"use client";

import { useState } from "react";
import { Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { removeSymbol, updateMinPrice } from "@/app/actions";
import type { WatchlistRow, PriceTick } from "@/lib/types";

type Props = {
  watchlist: WatchlistRow[];
  latestPrices: Record<string, number>;
};

export function WatchlistTable({ watchlist, latestPrices }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(row: WatchlistRow) {
    setEditingId(row.id);
    setEditValue(String(row.min_price));
  }

  async function saveEdit(symbol: string) {
    const val = parseFloat(editValue);
    if (!isNaN(val)) await updateMinPrice(symbol, val);
    setEditingId(null);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Current Price</TableHead>
          <TableHead>Min Price Alert</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {watchlist.map((row) => {
          const price = latestPrices[row.symbol];
          const below = price !== undefined && row.min_price > 0 && price < row.min_price;
          return (
            <TableRow key={row.id}>
              <TableCell className="font-mono font-semibold">{row.symbol}</TableCell>
              <TableCell>
                {price !== undefined ? `$${price.toFixed(2)}` : "—"}
              </TableCell>
              <TableCell>
                {editingId === row.id ? (
                  <div className="flex gap-1 items-center">
                    <Input
                      className="w-24 h-7 text-sm"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(row.symbol)}
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(row.symbol)}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <button
                    className="text-sm hover:underline cursor-pointer"
                    onClick={() => startEdit(row)}
                  >
                    {row.min_price > 0 ? `$${row.min_price.toFixed(2)}` : "—"}
                  </button>
                )}
              </TableCell>
              <TableCell>
                {below ? (
                  <Badge variant="destructive">Below min</Badge>
                ) : price !== undefined ? (
                  <Badge variant="secondary">OK</Badge>
                ) : (
                  <Badge variant="outline">No data</Badge>
                )}
              </TableCell>
              <TableCell>
                <form action={removeSymbol.bind(null, row.symbol)}>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          );
        })}
        {watchlist.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
              No stocks in watchlist. Add one above.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
