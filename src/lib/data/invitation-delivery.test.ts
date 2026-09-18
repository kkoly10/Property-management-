import { describe, expect, it, vi } from "vitest";
import { INVITATION_DELIVERY_STATES, getRelationshipInvitationDelivery, normalizeDeliveryState } from "./invitation-delivery";
import { INVITATION_DELIVERY_COPY } from "@/lib/notifications/delivery-copy";

/**
 * The delivery state an operator sees after a refresh, on the resident and owner directories.
 *
 * "Invited" only says a record exists. This says whether the message that makes it usable reached a
 * transport — and the state that matters is `undeliverable`, because such an invitation will never be
 * accepted and is otherwise indistinguishable from one sitting unread in an inbox.
 */
function supabaseReturning(data: unknown, error: unknown = null) {
  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    void fn; void args;
    return Promise.resolve({ data, error });
  });
  return { supabase: { rpc }, rpc };
}

describe("relationship invitation delivery", () => {
  it("maps each relationship to its delivery state", async () => {
    const { supabase, rpc } = supabaseReturning([
      { relationshipId: "person-1", deliveryState: "sent" },
      { relationshipId: "owner-1", deliveryState: "undeliverable" },
    ]);
    const delivery = await getRelationshipInvitationDelivery(supabase, "org-1");

    expect(rpc).toHaveBeenCalledWith("list_relationship_invitation_delivery", { p_organization_id: "org-1" });
    expect(delivery.get("person-1")).toBe("sent");
    expect(delivery.get("owner-1")).toBe("undeliverable");
  });

  it("degrades to no badge rather than breaking the directory", async () => {
    // A directory that cannot render because a delivery-status lookup failed is a worse outcome than
    // a directory with no delivery badges.
    for (const [data, error] of [[null, { message: "denied" }], [null, null], ["not an array", null]] as const) {
      const { supabase } = supabaseReturning(data, error);
      expect((await getRelationshipInvitationDelivery(supabase, "org-1")).size).toBe(0);
    }
  });

  it("coerces an unrecognized state instead of trusting it", () => {
    // A value this build does not know means the worker grew a state we predate. "Unknown" is the
    // honest rendering; passing it through would index the copy map with undefined and crash the page.
    expect(normalizeDeliveryState("sent")).toBe("sent");
    expect(normalizeDeliveryState("a_state_from_the_future")).toBe("unknown");
    expect(normalizeDeliveryState(undefined)).toBe("unknown");
    expect(normalizeDeliveryState(42)).toBe("unknown");
  });

  it("has operator-readable copy for every state, on every surface", () => {
    // One map serves the team page, the resident directory and the owner workspace, so a state added
    // without copy would render blank on three surfaces at once.
    for (const state of INVITATION_DELIVERY_STATES) {
      const copy = INVITATION_DELIVERY_COPY[state];
      expect(copy, state).toBeTruthy();
      expect(copy.label.length, state).toBeGreaterThan(3);
      expect(copy.hint.length, state).toBeGreaterThan(10);
    }
  });

  it("never claims the recipient received or read it", () => {
    // "Sent" means a transport accepted the message. Inbox receipt is not something Crecy observes, and
    // an operator who believes it was delivered stops chasing a resident who never got it.
    for (const state of INVITATION_DELIVERY_STATES) {
      const text = `${INVITATION_DELIVERY_COPY[state].label} ${INVITATION_DELIVERY_COPY[state].hint}`;
      expect(text, state).not.toMatch(/\b(delivered|received|opened|read by|inbox)\b/i);
    }
    expect(INVITATION_DELIVERY_COPY.sent.hint).toContain("accepted");
  });

  it("exposes no provider internals", () => {
    // Message ids, relay error codes and vendor names answer a question the operator did not ask.
    for (const state of INVITATION_DELIVERY_STATES) {
      const text = `${INVITATION_DELIVERY_COPY[state].label} ${INVITATION_DELIVERY_COPY[state].hint}`;
      expect(text, state).not.toMatch(/resend|message id|smtp|relay|_ERROR|[A-Z]{4,}_[A-Z]{4,}/i);
    }
  });

  it("marks a terminal failure as needing attention and a retryable one as not", () => {
    expect(INVITATION_DELIVERY_COPY.undeliverable.variant).toBe("destructive");
    expect(INVITATION_DELIVERY_COPY.undeliverable.label).toMatch(/failed/i);
    expect(INVITATION_DELIVERY_COPY.retrying.variant).toBe("warning");
    expect(INVITATION_DELIVERY_COPY.retrying.label).toMatch(/delayed/i);
    expect(INVITATION_DELIVERY_COPY.sent.variant).toBe("success");
  });
});
