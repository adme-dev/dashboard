// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, onBeforeUnmount, reactive, ref } from 'vue'
import { useBannerSlideDrag } from '../../app/composables/useBannerSlideDrag'

let dispose = () => {}
afterEach(() => {
  dispose()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function setup() {
  const state = reactive({ activeKey: 'square', project: { id: 'one' } })
  vi.stubGlobal('useBannerStudio', () => ({ state }))
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('onBeforeUnmount', onBeforeUnmount)
  const host = document.createElement('div')
  document.body.append(host)
  const move = vi.fn()
  let drag: ReturnType<typeof useBannerSlideDrag>
  const app = createApp({ setup() {
    drag = useBannerSlideDrag('strip', move)
    return () => h('button', { 'data-slide-surface': 'strip', 'data-slide-index': '1', 'onPointerdown': (event: PointerEvent) => drag.start(event, 0), 'onClickCapture': drag.preventClick }, 'Slide')
  } })
  app.mount(host)
  const button = host.querySelector('button')!
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(button)
  const pointer = (type: string, x: number, buttonIndex = 0) => (type === 'pointerdown' ? button : window).dispatchEvent(new PointerEvent(type, { clientX: x, clientY: 20, button: buttonIndex, bubbles: true }))
  dispose = () => {
    app.unmount()
    host.remove()
  }
  return { state, pointer, move, button, drag: () => drag }
}
it('reorders on pointer release and consumes the follow-up selection click', () => {
  const { pointer, move, button } = setup()
  pointer('pointerdown', 0)
  pointer('pointermove', 80)
  pointer('pointerup', 80)
  expect(move).toHaveBeenCalledWith(0, 1)
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  button.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
})
it('keeps clicks distinct from drags and ignores right-button drags', () => {
  const { pointer, move } = setup()
  pointer('pointerdown', 0)
  pointer('pointermove', 3)
  pointer('pointerup', 3)
  expect(move).not.toHaveBeenCalled()
  pointer('pointerdown', 0, 2)
  pointer('pointermove', 80)
  pointer('pointerup', 80)
  expect(move).not.toHaveBeenCalled()
})
it('cancels on layout changes, blur and unmount without a delayed reorder', () => {
  const { state, pointer, move } = setup()
  pointer('pointerdown', 0)
  state.activeKey = 'story'
  pointer('pointermove', 80)
  pointer('pointerup', 80)
  expect(move).not.toHaveBeenCalled()
  pointer('pointerdown', 0)
  pointer('pointermove', 80)
  window.dispatchEvent(new Event('blur'))
  pointer('pointerup', 80)
  expect(move).not.toHaveBeenCalled()
  pointer('pointerdown', 0)
  pointer('pointermove', 80)
  dispose()
  dispose = () => {}
  pointer('pointerup', 80)
  expect(move).not.toHaveBeenCalled()
})
