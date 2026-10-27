import type { Layer } from '~/types/banner-studio'

/** Measure actual glyphs after fonts load; clipping alone never proves readable copy. */
export async function assertScopedPreviewFits(frame: HTMLIFrameElement, layers: Layer[]): Promise<void> {
  const doc = frame.contentDocument
  if (!doc) throw new Error('Text preview could not be measured. Reload the preview.')
  await doc.fonts?.ready
  for (const layer of layers.filter(item => item.type === 'text')) {
    const element = doc.querySelector<HTMLElement>(`.layer[data-id="${layer.id}"]`)
    if (!element || element.textContent !== layer.text) throw new Error(`Preview wording could not be confirmed: ${layer.name}`)
    const style = doc.defaultView?.getComputedStyle(element)
    if (!style || style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) !== 1) throw new Error(`Preview wording is hidden: ${layer.name}`)
    const box = element.getBoundingClientRect()
    const range = doc.createRange()
    range.selectNodeContents(element)
    const glyphs = [...range.getClientRects()].filter(rect => rect.width && rect.height)
    if (!box.width || !box.height || !glyphs.length || element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
      || glyphs.some(rect => rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1)) {
      throw new Error(`Text does not fit its proposed area: ${layer.name}. Request more space or a smaller font.`)
    }
  }
}
