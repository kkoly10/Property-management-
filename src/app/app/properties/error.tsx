"use client";

import { Button } from "@/components/ui/button";

export default function PropertiesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center"><h2 className="text-lg font-semibold">The portfolio could not be loaded</h2><p className="mt-2 text-sm text-muted-foreground">Your data was not changed. Retry the request or contact support with reference <span className="font-mono">{error.digest ?? "unavailable"}</span>.</p><Button className="mt-5" onClick={reset}>Try again</Button></div>;
}
