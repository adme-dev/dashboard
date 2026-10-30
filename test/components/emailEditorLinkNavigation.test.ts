// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import Renderer from '~~/app/components/email/builder/EdmBlockRenderer.vue'

describe('email canvas link navigation', () => {
  it.each([
    ['unselected HTML button', 'Html', { contents: '<a href="https://example.com" target="_blank"><span>Book a drive</span></a>' }, 'span', 'click', true],
    ['modified HTML click', 'Html', { contents: '<a href="https://example.com">Book</a>' }, 'a', 'click', true],
    ['middle HTML click', 'Html', { contents: '<a href="https://example.com">Book</a>' }, 'a', 'auxclick', true],
    ['linked image', 'Image', { url: 'https://example.com/car.jpg', linkHref: 'https://example.com' }, 'img', 'click', true],
    ['preview link', 'Html', { contents: '<a href="https://example.com">Book</a>' }, 'a', 'click', false]
  ])('%s', async (_name, type, blockProps, selector, eventType, editable) => {
    const host = document.createElement('div')
    let bubbled = false
    host.addEventListener('click', () => { bubbled = true })
    const app = createApp({ render: () => h(Renderer, { type, props: blockProps, editable, htmlEditingEnabled: false }) })
    app.mount(host)
    // Browser input arrives after mount; avoid Vue synthetic-event timestamp guards.
    await new Promise(resolve => setTimeout(resolve, 1))
    try {
      const event = new MouseEvent(eventType, { bubbles: true, cancelable: true, ctrlKey: true, button: eventType === 'auxclick' ? 1 : 0 })
      host.querySelector(selector)!.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(editable)
      if (eventType === 'click') expect(bubbled).toBe(true)
    } finally { app.unmount() }
  })
})
