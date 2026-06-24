export interface CaretInsertResult {
  /** The new full text with `insert` spliced in. */
  text: string
  /** Where the caret should sit afterwards (just past the inserted text). */
  caret: number
}

/**
 * Splice `insert` into `text` at a textarea selection [start, end), replacing any
 * selected range, and report where the caret should land. Indices are clamped to
 * the text bounds and a reversed selection is normalised, so a stale or odd
 * selection appends cleanly rather than producing holes. Pure + framework-free so
 * the emoji/snippet insertion logic is unit-tested without a DOM.
 */
export function insertAtCaret(text: string, insert: string, start: number, end: number): CaretInsertResult {
  const len = text.length
  let s = Number.isFinite(start) ? start : len
  let e = Number.isFinite(end) ? end : len
  s = Math.max(0, Math.min(s, len))
  e = Math.max(0, Math.min(e, len))
  if (s > e) [s, e] = [e, s]
  return { text: text.slice(0, s) + insert + text.slice(e), caret: s + insert.length }
}
