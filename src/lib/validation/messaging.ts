import { z } from "zod";

export const sendConversationMessageSchema = z.object({
  bodyText: z.string().trim().min(1, "Write a message before sending.").max(10_000, "Messages must be 10,000 characters or fewer."),
});

