"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Print / Save as PDF — the ESIGN "right to retain a copy" affordance. Browser print is the retention
 * path already used for owner statements, so a signer keeps their own copy without a server render. */
export function PrintButton() {
  return <Button variant="outline" size="sm" onClick={() => window.print()}>
    <Printer className="h-4 w-4" />Print / Save as PDF
  </Button>;
}
