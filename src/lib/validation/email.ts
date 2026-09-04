const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: unknown): boolean {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function validateEmail(value: unknown): { normalized: string; valid: boolean; reason?: string } {
  const normalized = normalizeEmail(value);
  if (!normalized) return { normalized, valid: false, reason: "Missing email" };
  if (!isValidEmail(normalized)) return { normalized, valid: false, reason: "Invalid email format" };
  return { normalized, valid: true };
}
