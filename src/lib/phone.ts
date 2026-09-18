/**
 * Normalize user-entered phone text into E.164 without forcing North American users
 * to type a leading +1. International numbers remain explicit to avoid guessing
 * country codes.
 */
export function normalizePhoneE164(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/[\s().-]/g, "");
  if (/^\+[1-9][0-9]{7,14}$/.test(compact)) return compact;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
}
