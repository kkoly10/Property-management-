"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Triggers the browser's print dialog (Save as PDF). Hidden in the printed output itself. */
export function PrintButton() {
  return (
    <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />Save as PDF
    </Button>
  );
}
