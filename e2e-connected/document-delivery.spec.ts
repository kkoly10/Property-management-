import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

// Connected-mode E2E — document delivery + acknowledgement (operator -> resident portal).
// The operator deliver path is API-only (no UI form), so it is driven through the operator's
// authenticated browser session; the resident acknowledges through the real portal form.
// Fixture (seeded out of band): a clean deliverable document/version + an active resident
// relationship. Ids passed via env.
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const RES_EMAIL = process.env.E2E_RESIDENT_EMAIL;
const RES_PASSWORD = process.env.E2E_RESIDENT_PASSWORD;
const ORG = process.env.E2E_ORG_ID;
const VERSION = process.env.E2E_DELIVER_VERSION_ID;
const PERSON = process.env.E2E_RESIDENT_PERSON_ID;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD && ORG && VERSION && PERSON);
test.skip(!CONFIGURED, "Set connected env + E2E_ORG_ID/E2E_DELIVER_VERSION_ID/E2E_RESIDENT_PERSON_ID to run this leg.");

test.describe.configure({ mode: "serial" });

async function signIn(page: import("@playwright/test").Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("operator delivers a document to the resident (deliver_document API)", async ({ page }) => {
  await signIn(page, EMAIL!, PASSWORD!, "/app/documents");
  // page.request shares the operator's auth cookies with the browser context.
  const res = await page.request.post("/api/v1/document-deliveries", {
    headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
    data: {
      organizationId: ORG,
      documentVersionId: VERSION,
      recipientRelationshipType: "resident_person",
      recipientRelationshipId: PERSON,
      deliveryChannel: "portal",
    },
  });
  expect(res.status(), `deliver failed: ${await res.text()}`).toBeLessThan(300);
  const body = await res.json();
  expect(body.deliveryId ?? body.documentDeliveryId ?? body.id, "no delivery id in response").toBeTruthy();
});

test("resident acknowledges the delivered document (Crecy Living)", async ({ page }) => {
  test.skip(!(RES_EMAIL && RES_PASSWORD), "Set E2E_RESIDENT_EMAIL + E2E_RESIDENT_PASSWORD.");
  await signIn(page, RES_EMAIL!, RES_PASSWORD!, "/documents");
  await page.goto("/documents");
  await expect(page.getByText(/E2E Community Notice/i)).toBeVisible();
  await page.getByRole("button", { name: /Acknowledge receipt/i }).first().click();
  await expect(page.getByText(/Receipt acknowledged/i)).toBeVisible({ timeout: 30_000 });
});
