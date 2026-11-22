export const documentSigningIntent =
  "I have read and agree to this document, and I intend my electronic signature to bind me to it.";

export function isDocumentDeliveryAvailable(status: string, expiresAt: string | null) {
  return (status === "sent" || status === "delivered") && (!expiresAt || Date.parse(expiresAt) > Date.now());
}
