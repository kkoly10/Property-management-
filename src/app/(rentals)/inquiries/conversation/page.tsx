import type { Metadata } from "next";
import { conversationReference } from "@/lib/rental-conversation";
import { PrivateRentalConversation } from "./private-conversation";

export const metadata: Metadata = { title: "Your rental conversation · Crecy", robots: { index: false, follow: false } };

export default async function RentalConversationPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const initialReference = conversationReference.safeParse((await searchParams).ref);
  return (
    <section className="mx-auto max-w-2xl space-y-5 px-5 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Your rental conversation</h1>
      <PrivateRentalConversation initialReference={initialReference.success ? initialReference.data : ""} />
    </section>
  );
}
