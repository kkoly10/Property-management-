import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("text-xl font-bold tracking-[-0.035em] text-foreground", className)}>Crecy</span>;
}
