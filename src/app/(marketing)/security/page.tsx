import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Eyebrow, FeatureGrid, FeatureItem, Section, SectionHeading } from "@/components/marketing/sections";
import { marketingMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = marketingMetadata({
  title: "Security and data handling",
  description:
    "How Crecy isolates organizations, scopes access by role and property, records what happened, protects documents, and constrains support access. Written as architecture, not as certification.",
  path: "/security",
});

/**
 * The trust page.
 *
 * File 18 §1 prohibits SOC 2, "enterprise-grade security" as a certification-equivalent claim, uptime
 * figures, penetration-test claims without a signed report, and guarantees. So every statement here is
 * a description of a control that exists in the codebase — what the system does — and the page says
 * plainly which assurances Crecy does NOT yet have. That last section is the one that makes the rest
 * credible.
 */
export default function SecurityPage() {
  return (
    <>
      <Section className="!pb-10 lg:!pb-14">
        <div className="max-w-3xl">
          <Eyebrow>Security</Eyebrow>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-0.04em] text-balance sm:text-5xl">
            Access is decided by your relationship to a property.
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground text-pretty">
            Crecy holds rent, leases, identities and financial history for organizations that have nothing
            to do with each other. That makes isolation the first design constraint rather than a feature.
            This page describes the controls that exist today, in plain terms, and is explicit about what
            has not been independently assured.
          </p>
        </div>
      </Section>

      <Section tone="surface" className="!py-16 lg:!py-20">
        <SectionHeading
          eyebrow="Tenant isolation"
          title="One organization cannot read another's rows."
          lede="Every record belongs to an organization, and that ownership is enforced by the database itself — not by application code remembering to add a filter."
        />
        <FeatureGrid>
          <FeatureItem title="Row-level security on every tenant table">
            Tables carry an organization identifier and a row-level policy that resolves the caller&rsquo;s
            own memberships. A query that forgets its filter returns nothing rather than someone
            else&rsquo;s data.
          </FeatureItem>
          <FeatureItem title="The browser can read, never write">
            Client credentials are granted read access under policy and have insert, update and delete
            revoked. All writes go through server-side command functions that re-check authorization.
          </FeatureItem>
          <FeatureItem title="Sensitive tables are not readable at all">
            Records such as invitations are unreadable even to an authenticated client, and are reached
            only through functions that return a deliberately sanitized result.
          </FeatureItem>
          <FeatureItem title="Active context, not ambient access">
            An operator working in one organization has their session narrowed to it. The narrowing can
            only reduce what a query sees; it can never widen it.
          </FeatureItem>
          <FeatureItem title="Isolation is tested, not assumed">
            The test suite replays the full schema and drives real requests as residents, owners, staff and
            outsiders, asserting that each cross-tenant attempt is refused.
          </FeatureItem>
          <FeatureItem title="Server-side entitlements">
            Plan limits are evaluated on the server. Hiding a control in the interface is not treated as
            authorization.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      <Section className="!py-16 lg:!py-20">
        <SectionHeading
          eyebrow="Roles and scope"
          title="A leasing agent should not be able to move money."
          lede="Staff access is a role plus, optionally, a set of properties. Permissions are granular — read and manage, per domain — and every command checks the specific permission it needs against the specific property it is touching."
        />
        <FeatureGrid columns={2}>
          <FeatureItem title="Role-based permissions">
            Roles carry explicit permissions across property, resident, lease, finance, maintenance, owner
            and document domains. Reading requires the read permission; writing requires manage.
          </FeatureItem>
          <FeatureItem title="Property-scoped staff">
            A staff member can be limited to named properties. Their access to everything else — including
            reports and search — is narrowed to that scope.
          </FeatureItem>
          <FeatureItem title="Resident and owner self-service">
            Residents reach their own tenancy. Owner entities reach the properties they hold an interest
            in. Both are separate gates from staff access, not a weaker version of it.
          </FeatureItem>
          <FeatureItem title="Portal access requires an invitation">
            A resident or owner account only becomes connected to a tenancy or an ownership entity through
            an invitation the operator issued and the recipient accepted.
          </FeatureItem>
          <FeatureItem title="Multi-factor for privileged actions">
            Privileged operations require a session that has completed a second factor. The requirement is
            checked at the point of the action, not only at login.
          </FeatureItem>
          <FeatureItem title="Membership changes take effect immediately">
            Ending a membership ends the access it granted. There is no cached grant that outlives it.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      <Section tone="surface" className="!py-16 lg:!py-20">
        <SectionHeading
          eyebrow="History and evidence"
          title="Financial records are append-only, and actions are recorded."
          lede="The most useful security property of a rental ledger is that nobody can quietly change what it said last month."
        />
        <FeatureGrid>
          <FeatureItem title="Posted entries cannot be edited">
            The database rejects an update or delete against a posted journal entry. A correction is a new,
            balanced reversing transaction, so the original and the fix both remain visible.
          </FeatureItem>
          <FeatureItem title="Audit events for state changes">
            Commands write an audit record naming the actor, the action, the resource and a correlation
            identifier that ties every effect of one request together.
          </FeatureItem>
          <FeatureItem title="Idempotent commands">
            Requests carry an idempotency key. A retried or replayed request returns the original result
            instead of charging, paying or inviting twice.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      <Section className="!py-16 lg:!py-20">
        <SectionHeading
          eyebrow="Documents"
          title="Private storage, scanned before release, reached by short-lived links."
          lede="A lease is one of the most sensitive things an operator holds. Crecy never puts one behind a guessable public URL."
        />
        <FeatureGrid>
          <FeatureItem title="Quarantine, then scan, then release">
            An upload lands quarantined. It is scanned for malware before it can be read, and a file that
            fails is rejected rather than delivered. A scan that keeps failing is dead-lettered and
            surfaced for a human, not retried forever in silence.
          </FeatureItem>
          <FeatureItem title="Private buckets and access-checked links">
            Files are stored privately. Access is granted as a short-lived link minted only after the same
            permission check the rest of the system uses.
          </FeatureItem>
          <FeatureItem title="Secure delivery links are stored hashed">
            When a document is delivered by secure link, only a hash of the token is kept, and the token is
            scrubbed from the delivery queue once the job is finished.
          </FeatureItem>
          <FeatureItem title="Restricted file types">
            The accepted document types are constrained, and the same allowlist is enforced at the upload
            grant, the storage bucket, the import path and the API.
          </FeatureItem>
          <FeatureItem title="Versions supersede rather than overwrite">
            Replacing a document keeps the version a resident actually received.
          </FeatureItem>
          <FeatureItem title="Delivery is recorded">
            Who a document was sent to, when, and whether they acknowledged it.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      <Section tone="surface" className="!py-16 lg:!py-20">
        <div className="grid items-start gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Payments"
              title="Crecy does not hold resident rent."
              lede="Online payments are processed through eligible operators' connected payment accounts under the provider's connected-account model. The operator is the merchant of record for their own rent; the provider's processing charges are the operator's responsibility under those terms."
            />
            <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>Card numbers and bank credentials are handled by the payment provider. Crecy stores provider references, not payment instruments.</li>
              <li>Payment webhooks are signature-verified and processed idempotently, so a replayed event cannot double-post.</li>
              <li>Before confirming, a payer sees the merchant, amount, currency, method, any fee, and whether it settles immediately or pends.</li>
            </ul>
          </div>
          <div>
            <SectionHeading
              eyebrow="Support access"
              title="Support cannot quietly look at your data."
              lede="Crecy staff have no standing access to a customer organization. Access requires an explicit, time-boxed support session, and the reads it permits are narrow by construction."
            />
            <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>A support session is opened deliberately, recorded, and ends — one active session per staff member.</li>
              <li>Support access is read-only. There is no support action that writes to your records.</li>
              <li>Support reads go through purpose-built queries returning a fixed, sanitized shape — not raw table access — and a support session grants no bypass of the row-level policies that protect your data.</li>
              <li>Each support read is itself recorded as an audited event.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section className="!py-16 lg:!py-20">
        <SectionHeading
          eyebrow="Data minimization"
          title="Collect what the job needs; keep it where it belongs."
          lede="Crecy is a rental operations system, so it holds names, contact details, tenancies and payment history. It is designed not to accumulate more than that."
        />
        <FeatureGrid>
          <FeatureItem title="Projections, not raw rows">
            Residents, owners and vendors receive server-selected projections containing only the fields
            their screen needs.
          </FeatureItem>
          <FeatureItem title="No credit or screening data in the pilot">
            Crecy does not run tenant screening, credit checks or automated housing decisions, and does not
            store the data that would require.
          </FeatureItem>
          <FeatureItem title="Operational logs are sanitized">
            Diagnostic surfaces expose identifiers, states and bounded reason codes — never document
            contents, storage locations, delivery tokens, message bodies or payment credentials.
          </FeatureItem>
          <FeatureItem title="Privacy requests are first-class">
            Access and deletion requests are handled as recorded workflows rather than ad-hoc database
            edits, and financial records that must be retained are retained deliberately.
          </FeatureItem>
          <FeatureItem title="Deletion does not rewrite history">
            Removing an operational record cannot erase the financial history that references it, because
            that history is append-only.
          </FeatureItem>
          <FeatureItem title="Regional data handling">
            Crecy is designed for the United States, Canada and Mexico, with each property carrying its own
            country, currency and time zone.
          </FeatureItem>
        </FeatureGrid>
      </Section>

      {/* The section that makes the rest of the page credible. */}
      <Section tone="surface">
        <div className="max-w-3xl">
          <Eyebrow>What we do not claim</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
            Controls we have built, not assurances someone else has signed.
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">
            Everything above describes how the system is built. None of it is an independent audit, and we
            will not imply otherwise.
          </p>
          <ul className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">No SOC 2 report.</span> Crecy holds no SOC 2 or
              equivalent certification, and none of the controls above should be read as one.
            </li>
            <li>
              <span className="font-medium text-foreground">No published uptime figure.</span> We do not
              quote an availability percentage without monitoring data over a declared period.
            </li>
            <li>
              <span className="font-medium text-foreground">No penetration-test claim.</span> We will state
              one when there is a signed report with a date, a scope and a remediation record.
            </li>
            <li>
              <span className="font-medium text-foreground">Accessibility is a target.</span> WCAG 2.2 AA is
              what Crecy is built toward; it is not a conformance claim from an external audit.
            </li>
            <li>
              <span className="font-medium text-foreground">No guarantees.</span> No system is free of
              downtime, fraud or defects, and a vendor promising otherwise is telling you something untrue.
            </li>
            <li>
              <span className="font-medium text-foreground">Availability is being prepared.</span> North
              American availability depends on payment, support, privacy and localization gates that are
              still in progress.
            </li>
          </ul>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="outline"><Link href="/legal">Read the legal documents</Link></Button>
            <Button asChild size="lg"><Link href="/pilot">Join the pilot</Link></Button>
          </div>
        </div>
      </Section>
    </>
  );
}
