import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { AlertLogRow } from "@/lib/types";
import { format } from "date-fns";

export function AlertsTable({ alerts }: { alerts: AlertLogRow[] }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-muted-foreground">No alerts sent yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Price at Alert</TableHead>
          <TableHead>Min Price</TableHead>
          <TableHead>Sent At</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-mono font-semibold">{row.symbol}</TableCell>
            <TableCell className="text-destructive">${row.price.toFixed(2)}</TableCell>
            <TableCell>${row.min_price.toFixed(2)}</TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {format(new Date(row.sent_at), "MMM d, yyyy HH:mm")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
