import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

// Certification reporter for `npm run test:e2e:connected:full`. Unlike the partial connected run
// (which tolerates self-skipped legs when their fixtures are absent), certification treats a skipped
// REQUIRED P0 leg as a failure: a pilot pass must prove every non-provider-blocked journey end to end.
//
// A test is allowed to skip ONLY if it is tagged @external — i.e. it needs an external provider
// (Stripe test keys, a mail transport, an MFA/TOTP-enrolled platform actor) that is deliberately out of
// scope for this command. Any other skip means a required fixture was not provided, and the run fails.
//
// It also enumerates the provider-blocked workflows that have no automated spec at all, so the report
// names what is excluded rather than silently omitting it.

const EXTERNALLY_EXCLUDED_WORKFLOWS = [
  "Stripe provider payments — needs test Connect keys (routes 503 without them)",
  "Stripe refunds — needs test Connect keys",
  "Stripe payouts / payout reconciliation — needs test Connect keys",
  "Staff-invitation email delivery — needs SUPABASE_SECRET_KEY + a mail transport",
  "Platform support-session MFA happy path — needs an AAL2/TOTP-enrolled platform actor",
];

const isExternal = (test: TestCase) => test.tags.includes("@external") || test.title.includes("@external");
const name = (test: TestCase) => test.titlePath().slice(1).filter(Boolean).join(" › ");

class CertificationReporter implements Reporter {
  private passed = 0;
  private failed = 0;
  private externalSkipped: string[] = [];
  private requiredSkipped: string[] = [];
  private failures: string[] = [];
  private specFiles = new Set<string>();

  onTestEnd(test: TestCase, result: TestResult) {
    this.specFiles.add(test.location.file);
    if (result.status === "skipped") {
      (isExternal(test) ? this.externalSkipped : this.requiredSkipped).push(name(test));
      return;
    }
    if (result.status === "passed") {
      this.passed += 1;
    } else {
      this.failed += 1; // failed | timedOut | interrupted
      this.failures.push(`${name(test)} (${result.status})`);
    }
  }

  async onEnd() {
    const executed = this.passed + this.failed;
    const certFailed = this.failed > 0 || this.requiredSkipped.length > 0;
    const lines = [
      "",
      "── Connected pilot certification ─────────────────────────────────────",
      `specs (files):        ${this.specFiles.size}`,
      `executed:             ${executed}`,
      `  passed:             ${this.passed}`,
      `  failed:             ${this.failed}`,
      `required skipped:     ${this.requiredSkipped.length}`,
      `externally-excluded:  ${this.externalSkipped.length} tagged spec(s) + ${EXTERNALLY_EXCLUDED_WORKFLOWS.length} provider-blocked workflow(s)`,
    ];
    for (const workflow of EXTERNALLY_EXCLUDED_WORKFLOWS) lines.push(`    · ${workflow}`);
    for (const spec of this.externalSkipped) lines.push(`    · @external (skipped, allowed): ${spec}`);
    if (this.failures.length) {
      lines.push("", "Failures:");
      for (const failure of this.failures) lines.push(`    ✗ ${failure}`);
    }
    if (this.requiredSkipped.length) {
      lines.push("", "CERTIFICATION FAILED — required P0 legs were SKIPPED (their fixtures were not provided):");
      for (const spec of this.requiredSkipped) lines.push(`    ✗ ${spec}`);
      lines.push("  Provide every required fixture (see .env.e2e.example) so no required leg self-skips.");
    }
    lines.push(
      "",
      certFailed
        ? "RESULT: FAILED — this is NOT a certified pilot pass."
        : "RESULT: PASSED — every required P0 leg executed and passed.",
      "──────────────────────────────────────────────────────────────────────",
      "",
    );
    process.stdout.write(lines.join("\n"));

    if (certFailed) {
      process.exitCode = 1;
      return { status: "failed" as const };
    }
    return undefined;
  }
}

export default CertificationReporter;
