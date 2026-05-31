// server/utils/email-marketing/email.ts
// Pure email normalization + validation for subscriber records.

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

// Pragmatic single-pass validator: exactly one @, non-empty local part,
// a dotted domain, no whitespace. Not RFC-5322-exhaustive by design — it
// matches what real signup/import data needs.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(raw: string): boolean {
  const e = normalizeEmail(raw)
  if (e.length === 0 || e.length > 254) return false
  return EMAIL_RE.test(e)
}
