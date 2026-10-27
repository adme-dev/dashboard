// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { preventContextMenuRelease } from '../../app/utils/banner-context-menu'

describe('context menu opening pointer release', () => {
  it('cancels the opening secondary release so it cannot activate the item under the pointer', () => {
    preventContextMenuRelease(new MouseEvent('contextmenu', { button: 2 }))
    const release = new PointerEvent('pointerup', { button: 2, bubbles: true, cancelable: true })
    document.body.dispatchEvent(release)
    expect(release.defaultPrevented).toBe(true)
    const subsequent = new PointerEvent('pointerup', { button: 0, bubbles: true, cancelable: true })
    document.body.dispatchEvent(subsequent)
    expect(subsequent.defaultPrevented).toBe(false)
  })

  it('does not consume normal pointer selection after keyboard or release-time context-menu opening', () => {
    for (const button of [0, 2]) {
      preventContextMenuRelease(new MouseEvent('contextmenu', { button }))
      const release = new PointerEvent('pointerup', { button: 0, bubbles: true, cancelable: true })
      document.body.dispatchEvent(release)
      expect(release.defaultPrevented).toBe(false)
    }
  })
})
