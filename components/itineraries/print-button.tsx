"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Browser print-to-PDF — the "PDF" export (docs Phase 11 spec) without a server-side rendering dependency. */
export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" className="print:hidden" onClick={() => window.print()}>
      <Printer className="size-3.5" aria-hidden /> Print / Save as PDF
    </Button>
  );
}
