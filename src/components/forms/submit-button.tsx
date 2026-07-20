"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function SubmitButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className={className} disabled={pending}>
      {pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Working…" : children}
    </Button>
  );
}
