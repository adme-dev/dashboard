// server/utils/leads/emailHeaders.ts
// Header-safe helpers for lead emails. Visitor-supplied values must never be
// able to add a header or a second recipient.

// One local@domain address (RFC 5321 dot-atom only): no whitespace or control
// characters, no list separators, no display-name or quoting syntax, no empty
// or edge dots in the local part, and LDH domain labels with a dotted domain.
const ATEXT = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"
const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?'
const SINGLE_ADDRESS = new RegExp(`^${ATEXT}(?:\\.${ATEXT})*@(?:${LABEL}\\.)+${LABEL}$`)
const MAX_ADDRESS_LENGTH = 254
const MAX_LOCAL_LENGTH = 64

/** Returns the trimmed address only when it is exactly one syntactically valid
 * mailbox; anything else (lists, display names, line breaks) returns null. */
export function singleEmailAddress(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.length > MAX_ADDRESS_LENGTH) return null
  if (value.indexOf('@') > MAX_LOCAL_LENGTH) return null
  return SINGLE_ADDRESS.test(value) ? value : null
}

/** Collapses CR, LF and other control characters to single spaces. */
export function stripHeaderBreaks(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, ' ').replace(/ {2,}/g, ' ').trim()
}
