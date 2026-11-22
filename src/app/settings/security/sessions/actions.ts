"use server";

import { revokeOtherSessions } from "@/lib/auth/session-revocation";

export async function revokeOtherSessionsAction(_previous: string, formData: FormData): Promise<string> {
  return revokeOtherSessions(formData);
}
