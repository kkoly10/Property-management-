import type { CrecyProduct } from "@/components/brand/wordmark";
import type { HostClassification } from "@/lib/runtime/host";

/**
 * Which Crecy audience is signing in, and what the sign-in screen should say to them.
 *
 * One `(auth)` layout and one /login page serve three domains. Until now they said the same thing on
 * all three, so a resident invited to their home arrived at crecyliving.com and was told to sign in
 * to their "operator workspace" with their "work email", under a headline about operating a rental
 * portfolio and keeping USD/CAD/MXN books from mixing — and was offered a free trial they must never
 * start. Every line was addressed to somebody else.
 *
 * The host is READ ONLY as presentation context. It selects copy and nothing else: what the person
 * may then see is decided by their authenticated relationship and the RLS behind it, exactly as
 * `@/lib/runtime/host` insists. Choosing the wrong copy would be embarrassing; it could never be a
 * privilege escalation.
 *
 * Icons travel as names rather than components so this module stays pure and testable.
 */
export type AuthSurface = "operator" | "resident" | "owner";
export type AuthPromiseIcon = "portfolio" | "shield" | "currency" | "home" | "maintenance" | "message" | "statement";

export type AuthSurfaceCopy = {
  /**
   * The product lockup beside the Crecy mark. Matches the convention the portals already follow --
   * resident pages render "Crecy | Living", owner pages "Crecy | Owner", and the operator app the
   * bare wordmark -- so signing in looks like the product you are signing in to.
   */
  product?: CrecyProduct;
  /** Left panel */
  eyebrow: string;
  headline: string;
  promises: { icon: AuthPromiseIcon; text: string }[];
  footnote: string;
  /** Sign-in card */
  title: string;
  description: string;
  emailLabel: string;
  /** Only the operator surface is self-serve. Residents and owners arrive by invitation. */
  showTrialLink: boolean;
  /**
   * Where someone lands when they sign in without a `next` — a returning resident opening their
   * bookmark rather than following an invitation. This used to be `/app` for everybody, which sent a
   * renter into the operator workspace.
   */
  homePath: string;
};

/**
 * Development and unrecognized hosts fall back to the operator surface, which is the behaviour that
 * shipped before this module existed. Local development reaches every surface from one origin, so
 * anything else would make the operator app undevelopable — the same reason `classifyHost` checks for
 * a development host before it compares configured ones.
 */
export function authSurfaceFor(classification: HostClassification): AuthSurface {
  switch (classification.kind) {
    case "living-root":
    case "living-community":
      return "resident";
    case "owner":
      return "owner";
    default:
      return "operator";
  }
}

export const AUTH_SURFACE_COPY: Record<AuthSurface, AuthSurfaceCopy> = {
  operator: {
    eyebrow: "Rental operations, made clear",
    headline: "Operate every rental relationship from one trusted system.",
    promises: [
      { icon: "portfolio", text: "One clear system for properties, residents, money, and maintenance." },
      { icon: "shield", text: "Database-enforced access controls designed for every relationship." },
      { icon: "currency", text: "Built for USD, CAD, and MXN books without mixing currencies." },
    ],
    footnote: "Crecy OS",
    title: "Sign in to Crecy",
    description: "Continue to your operator workspace.",
    emailLabel: "Work email",
    showTrialLink: true,
    homePath: "/app",
  },
  resident: {
    product: "Living",
    eyebrow: "Your home, online",
    headline: "Everything about your tenancy, in one place.",
    promises: [
      { icon: "home", text: "Pay rent and keep every receipt together." },
      { icon: "maintenance", text: "Report a maintenance issue and follow it through to done." },
      { icon: "message", text: "Message your property team without losing the thread." },
    ],
    footnote: "Crecy Living",
    title: "Sign in to Crecy Living",
    description: "Continue to your resident portal.",
    emailLabel: "Email",
    showTrialLink: false,
    homePath: "/home",
  },
  owner: {
    product: "Owner",
    eyebrow: "Your ownership, clearly",
    headline: "Finalized statements, recorded distributions, and decisions in one place.",
    promises: [
      { icon: "statement", text: "Owner statements you can open, print, or export." },
      { icon: "portfolio", text: "Recorded remittances stay tied to the property and statement history." },
      { icon: "shield", text: "Approve the work that needs your decision." },
    ],
    footnote: "Crecy Owner",
    title: "Sign in to Crecy",
    description: "Continue to your owner portal.",
    emailLabel: "Email",
    showTrialLink: false,
    homePath: "/owner",
  },
};
