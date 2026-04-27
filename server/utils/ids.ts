/**
 * Tiny shared id helpers — keeps endpoint files free of duplicated regex.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUUID(value: string): boolean {
  return UUID_RE.test(value)
}
