import { expect, test } from "@playwright/test";

/**
 * The legal registry and its binding to onboarding consent (file 27 §5.A4).
 *
 * Before this slice, onboarding sent a hardcoded `p_terms_version: "2026-07-20"` — a date with no
 * corresponding artifact — next to a checkbox that read "I agree to the Terms" and linked to nothing.
 * These tests assert the artifacts exist, are reachable, declare their own version and publication
 * state, and that the consent statement names and links to them.
 */
test.describe.configure({ mode: "serial" });

const DOCUMENTS = [
  { code: "operator_terms", slug: "operator-terms" },
  { code: "privacy_notice", slug: "privacy-notice" },
];

test("the legal index lists every artifact with its version and publication state", async ({ page }) => {
  await page.goto("/legal");
  await expect(page.getByRole("heading", { name: "Legal documents" })).toBeVisible();
  for (const document of DOCUMENTS) {
    const link = page.getByTestId(`legal-link-${document.code}`);
    await expect(link).toBeVisible();
    await expect(page.getByText(/Version .* · effective \d{4}-\d{2}-\d{2}/).first()).toBeVisible();
  }
});

for (const document of DOCUMENTS) {
  test(`${document.code} is readable at its canonical public route and publishes its content hash`, async ({ page }) => {
    await page.goto(`/legal/${document.slug}`);
    const body = page.getByTestId("legal-document-body");
    await expect(body).toBeVisible();
    expect((await body.textContent())?.length ?? 0).toBeGreaterThan(400);

    // The content hash is what lets anyone check a stored consent record against the real artifact.
    const hash = await page.getByTestId("legal-content-hash").textContent();
    expect(hash).toMatch(/[0-9a-f]{64}/);
  });
}

test("an unpublished version says so instead of looking binding", async ({ page }) => {
  await page.goto("/legal/operator-terms");
  const state = (await page.locator('[data-slot="badge"]').first().textContent())?.trim();
  const draftNotice = await page.getByText("This version is not published").count();

  // Exactly one of the two states, and they must agree. A draft that renders without the notice would
  // look binding; a published document that renders the notice would look worthless.
  expect(["draft", "published", "retired"]).toContain(state);
  expect(draftNotice, `state "${state}" and the draft notice disagree`).toBe(state === "published" ? 0 : 1);
});

test("the onboarding consent statement names the exact artifacts and links to them", async ({ page }) => {
  await page.goto("/onboarding/organization");
  const statement = page.getByTestId("consent-statement");
  await expect(statement).toBeVisible();

  for (const document of DOCUMENTS) {
    const link = statement.getByTestId(`consent-link-${document.code}`);
    await expect(link, `${document.code} was not linked from the consent statement`).toBeVisible();
    await expect(link).toHaveAttribute("href", `/legal/${document.slug}`);
  }

  // The version being accepted is stated, not implied.
  await expect(statement).toContainText(/v\d+\.\d+\.\d+/);
  await expect(statement).toContainText(/effective \d{4}-\d{2}-\d{2}/);
});

test("a draft is disclosed on the consent screen rather than presented as accepted terms", async ({ page }) => {
  await page.goto("/onboarding/organization");
  const warning = page.getByTestId("consent-draft-warning");
  const blocked = page.getByTestId("consent-blocked");
  const statement = page.getByTestId("consent-statement");
  // Either the documents are published (no warning, statement present), or they are drafts and the
  // screen says so. What must never happen is a draft presented as ordinary binding terms.
  if (await warning.count()) {
    await expect(warning).toContainText(/draft pending legal review/i);
    await expect(statement).toBeVisible();
  } else {
    expect(await blocked.count()).toBe(0);
  }
});

test("the consent version travels with the submission so it cannot drift from what was shown", async ({ page }) => {
  await page.goto("/onboarding/organization");
  const version = await page.locator('input[name="consentVersion"]').inputValue();
  expect(version).toMatch(/^operator_terms@[^+]+\+privacy_notice@[^#]+#[0-9a-f]{16}$/);
  expect(version).not.toBe("2026-07-20");
});

/**
 * The contact-address correction, as a reader of the public pages actually experiences it.
 *
 * 1.0.0 of both documents went out carrying placeholder `@crecy.example` addresses — a published legal
 * document telling people to write to an address that does not exist. 1.0.1 carries the real ones. The
 * assertions below are deliberately specific about the version: a generic "some version is shown" check
 * would pass just as happily if the canonical route had started resolving the archived artifact.
 */
const CORRECTED = [
  { slug: "operator-terms", contact: "legal@crecyos.com" },
  { slug: "privacy-notice", contact: "privacy@crecyos.com" },
];

for (const document of CORRECTED) {
  test(`/legal/${document.slug} publishes 1.0.1 with the real contact address`, async ({ page }) => {
    await page.goto(`/legal/${document.slug}`);
    await expect(page.locator('[data-slot="badge"]').first()).toHaveText("published");
    await expect(page.getByText("Version 1.0.1 \u00b7 effective 2026-09-18")).toBeVisible();

    const body = page.getByTestId("legal-document-body");
    await expect(body).toContainText(document.contact);
    // The placeholder is gone from the page a person reads, not merely from the metadata.
    await expect(body).not.toContainText("crecy.example");
    await expect(page.getByTestId("legal-content-hash")).toContainText(/[0-9a-f]{64}/);
  });
}

test("the ESIGN disclosure is untouched by the contact correction", async ({ page }) => {
  // It never carried a Crecy contact address — it points signers at whoever sent them the document —
  // so a version bump here would be an accident, and `sign_document` stores the version a signer saw.
  await page.goto("/legal/esign-consent");
  await expect(page.getByText("Version 1.0.0 \u00b7 effective 2026-09-04")).toBeVisible();
});

test("onboarding offers the corrected versions and binds the submission to them", async ({ page }) => {
  await page.goto("/onboarding/organization");
  const statement = page.getByTestId("consent-statement");
  await expect(statement).toContainText("Crecy Operator Terms of Service");
  await expect(statement).toContainText("Crecy Privacy Notice");
  // Both documents, both at the corrected version, stated rather than implied.
  await expect(statement.getByText("(v1.0.1, effective 2026-09-18)")).toHaveCount(2);

  // The hidden field the server compares against is the same binding, not a stale one left in a cache.
  const version = await page.locator('input[name="consentVersion"]').inputValue();
  expect(version).toMatch(/^operator_terms@1\.0\.1\+privacy_notice@1\.0\.1#[0-9a-f]{16}$/);
});
