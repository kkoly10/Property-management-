import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CircleAlert,
  FileText,
  Home,
  KeyRound,
  Landmark,
  Search,
  Settings2,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { searchOperatorWorkspace, type OperatorSearchKind } from "@/lib/data/search";
import { parseOperatorSearch } from "@/lib/validation/search";

export const dynamic = "force-dynamic";

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const labels: Record<OperatorSearchKind, string> = {
  property: "Property",
  unit: "Unit",
  resident: "Resident",
  lease: "Lease",
  payment: "Payment",
  maintenance_request: "Maintenance request",
  work_order: "Work order",
  document: "Document",
  owner_entity: "Owner",
};

const icons = {
  property: Building2,
  unit: Home,
  resident: UsersRound,
  lease: KeyRound,
  payment: Landmark,
  maintenance_request: Wrench,
  work_order: Wrench,
  document: FileText,
  owner_entity: UserRound,
} satisfies Record<OperatorSearchKind, typeof Building2>;

const statusLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const parsed = parseOperatorSearch(await searchParams);
  const result = parsed.state === "ready"
    ? await searchOperatorWorkspace(parsed.query)
    : { mode: "ready" as const, query: parsed.query, items: [] };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">Operator workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Search</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Find records in the properties and operational domains your current role can access.
        </p>
      </div>

      <form action="/app/search" method="get" role="search" className="flex gap-2">
        <label htmlFor="operator-search-page" className="sr-only">Search your workspace</label>
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="operator-search-page"
            name="q"
            type="search"
            defaultValue={parsed.query}
            minLength={2}
            maxLength={80}
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Property, unit, resident, reference, or document"
            className="pl-9"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {parsed.state === "invalid" ? (
        <Alert variant="warning">
          <CircleAlert aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Use 2 to 80 characters</AlertTitle>
          <AlertDescription>Search supports names, property addresses, unit codes, public references, and document titles.</AlertDescription>
        </Alert>
      ) : null}
      {result.mode === "setup" ? (
        <Alert variant="info">
          <Settings2 aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Connect Supabase to activate search</AlertTitle>
          <AlertDescription>Search results appear after the reviewed database migration and project environment are connected.</AlertDescription>
        </Alert>
      ) : null}
      {result.mode === "error" ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" className="h-5 w-5" />
          <AlertTitle>Search unavailable</AlertTitle>
          <AlertDescription>Refresh and try again. Request {result.requestId}.</AlertDescription>
        </Alert>
      ) : null}

      {parsed.state === "empty" ? (
        <Card>
          <CardContent className="px-6 py-14 text-center">
            <Search aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-4 font-semibold">Search your authorized workspace</p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Search by property or owner name, address, unit code, resident household, lease or public transaction reference, maintenance title, or document title.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {parsed.state === "ready" && result.mode === "ready" ? (
        <section aria-live="polite" aria-label="Search results">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Results for “{parsed.query}”</h2>
            <span className="text-sm text-muted-foreground">{result.items.length} found</span>
          </div>
          {result.items.length ? (
            <Card className="overflow-hidden">
              <div className="divide-y">
                {result.items.map((item) => {
                  const Icon = icons[item.kind];
                  return (
                    <Link
                      key={`${item.kind}:${item.resourceId}:${item.propertyId ?? ""}`}
                      href={item.href}
                      className="group flex items-start gap-4 px-5 py-5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                    >
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{item.title}</span>
                          <Badge variant="neutral">{labels[item.kind]}</Badge>
                          <Badge variant="info">{statusLabel(item.status)}</Badge>
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">{item.subtitle}</span>
                      </span>
                      <ArrowRight aria-hidden="true" className="mt-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  );
                })}
              </div>
            </Card>
          ) : (
            <Card>
              <CardContent className="px-6 py-14 text-center">
                <Search aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-4 font-semibold">No authorized results</p>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  Check the spelling or try a shorter name or reference. Results outside your property and role scope stay hidden.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      ) : null}
    </div>
  );
}
