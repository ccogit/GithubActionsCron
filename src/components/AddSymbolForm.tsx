"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addSymbol } from "@/app/actions";

export function AddSymbolForm() {
  const formRef = useRef<HTMLFormElement>(null);

  async function handleAction(formData: FormData) {
    await addSymbol(formData);
    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={handleAction} className="flex gap-2">
      <Input
        name="symbol"
        placeholder="Ticker (e.g. AAPL)"
        className="w-40 font-mono uppercase"
        required
      />
      <Input
        name="min_price"
        type="number"
        step="0.01"
        min="0"
        placeholder="Min price (optional)"
        className="w-44"
      />
      <Button type="submit">Add</Button>
    </form>
  );
}
