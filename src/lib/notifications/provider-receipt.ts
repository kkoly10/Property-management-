/** Preserve the identifier exactly after trimming. A shortened receipt cannot be reconciled. */
export function readProviderMessageId(value: unknown): string | null {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const id = value.trim();
  return id.length > 0 && id.length <= 200 ? id : null;
}
