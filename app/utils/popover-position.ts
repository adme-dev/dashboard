/**
 * Compute viewport-aware position for a fixed popover.
 * Prefers below + left-aligned, shifts/flips to stay within viewport.
 */
export function computePopoverPosition(
  rect: DOMRect,
  popoverWidth: number,
  estimatedHeight: number = 300,
  gap: number = 8
): { x: number; y: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Horizontal: prefer left-aligned, shift left if overflow
  let x = rect.left
  if (x + popoverWidth > vw - gap) {
    x = vw - popoverWidth - gap
  }
  if (x < gap) x = gap

  // Vertical: below by default, above if insufficient space
  let y = rect.bottom + gap
  if (y + estimatedHeight > vh - gap) {
    y = rect.top - estimatedHeight - gap
    if (y < gap) y = gap
  }

  return { x, y }
}
