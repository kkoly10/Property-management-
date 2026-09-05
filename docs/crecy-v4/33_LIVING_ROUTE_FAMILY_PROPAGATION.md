# Crecy Living Route-Family Propagation

**Review date:** 2026-09-05  
**Scope:** payments, maintenance, messages, documents, preferences  
**Authority:** files 29–32 plus current resident-safe read models and command contracts

## Verdict

The main resident route family now inherits the Crecy Living shell instead of rebuilding a white header and mobile navigation on every page.

This is not a recolor of Crecy OS. The resident family is intentionally task-first, touch-first, green, and tied to the resident’s home relationship.

## 1. Shared shell

The following routes now use `LivingShell` and the same desktop/mobile navigation:

- `/payments/new`
- `/maintenance`
- `/maintenance/new`
- `/maintenance/:requestId`
- `/messages`
- `/messages/:conversationId`
- `/documents`
- `/more/preferences`

The old page-local white headers, duplicated bottom navigation, hard-coded `#f6f8fb` canvas, and mixed wordmark/badge identity treatments are removed from these routes.

## 2. Payment journey

The payment experience is now one continuous three-step resident journey:

1. amount and exact charge allocations;
2. payment method;
3. authorization.

The old three generic Card blocks were removed. Charge allocations are a ledger-like resident list inside the journey, and the final Stripe confirmation semantics remain unchanged.

Preserved:
- `getResidentPaymentSessionOptions`;
- retry context and failed-attempt behavior;
- exact charge allocation validation;
- resident authorization;
- idempotency;
- provider confirmation as payment truth;
- Crecy never treating return from Stripe as proof of payment.

## 3. Maintenance

### Request list
Requests are now one continuous resident register rather than one Card per issue.

### New request
The draft/upload form lives inside one Living intake surface. Existing local draft persistence, photo compression, private upload grants, scan/finalization, and idempotent maintenance command behavior are unchanged.

### Request detail
A resident-visible progress signature now shows the actual resident workflow states. Unknown statuses are not guessed. Canceled requests receive an explicit canceled treatment.

The detail view continues to expose only the resident-safe projection. Vendor identity, internal operator notes, private owner decisions, and maintenance costs are not added.

## 4. Messages

The resident message list now has a dedicated Living presentation: one continuous conversation register with property context and latest visible message.

The actual thread remains a conversation surface with resident-safe messages and the existing send-message endpoint. No unread counts or participant identities are invented.

## 5. Documents

Delivered documents are now one continuous delivery register instead of a grid of document cards.

The redesign preserves:
- secure download links;
- review/sign flow;
- signature certificates;
- receipt acknowledgement;
- exact delivered version/evidence hash;
- current document access boundaries.

## 6. Preferences

Preferences now live inside the shared Living shell rather than a standalone page identity.

The existing settings matrix remains intentionally information-dense because it represents real channel/category controls, accessibility settings, marketing-consent separation, and delivery diagnostics. It is not converted into decorative resident shortcut cards.

## 7. Genericness gate

A regression test at `src/lib/design/living-workspaces.test.ts` checks that:
- the route family uses `LivingShell`;
- old standalone headers/backgrounds/bottom navigation do not return;
- the payment journey does not regress to Card composition;
- maintenance list/detail do not regress to Card composition;
- Living messages use the resident presentation;
- documents remain a continuous register;
- resident-safe read models remain wired.

## 8. Remaining Living gap — community presentation contract

The image-led community experience in the approved mocks is still not fully implementable from authoritative data.

The repository does not yet expose a public-safe community presentation contract for:
- community display name;
- hero/cover media;
- public address;
- leasing-office contact;
- office hours;
- selected amenities;
- public notices/help information.

Until that contract exists, the product must continue using the safe non-photographic community fallback rather than hard-coding or inventing property imagery.

## 9. Next Living step

After deployed screenshot review of this route-family batch, the next structural Living task is the public-safe community presentation model and media pipeline. That should be designed separately from resident/tenancy data so unauthenticated community login surfaces never expose private resident or financial information.
