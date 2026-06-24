/**
 * Pure helper for the publishing Queue drag-to-reorder (Slice 3). Kept
 * framework-free so the reorder maths is unit-tested independently of the page.
 */

/**
 * Immutably move the item at `from` to index `to`. Out-of-bounds indices or
 * `from === to` return a copy in the original order (caller can skip the persist).
 */
export function reorder<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr]
  if (
    from < 0 || from >= next.length ||
    to < 0 || to >= next.length ||
    from === to
  ) {
    return next
  }
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
