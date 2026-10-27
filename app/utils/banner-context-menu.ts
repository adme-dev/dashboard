/**
 * A menu opening on secondary pointerdown can appear beneath that same pointer.
 * Reka selects an item on pointerup even without a preceding pointerdown there;
 * cancel this one release, preserving later left clicks and keyboard selection.
 */
export function preventContextMenuRelease(event: MouseEvent) {
  if (event.button !== 2) return
  document.addEventListener('pointerup', (release) => {
    if (release.button === 2) release.preventDefault()
  }, { capture: true, once: true })
}
