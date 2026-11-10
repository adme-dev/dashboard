// @vitest-environment jsdom
// DOMPurify explicitly does not support happy-dom for security assertions.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h } from 'vue'

vi.stubGlobal('computed', computed)
const { default: ChatMarkdown } = await import('~~/app/components/chat/ChatMarkdown.vue')
const cleanup: Array<() => void> = []
afterEach(() => { cleanup.splice(0).forEach(fn => fn()) })

function render(content: string) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(ChatMarkdown, { content }) })
  app.mount(host)
  cleanup.push(() => app.unmount())
  return host
}

describe('chat markdown sanitization with the locked DOMPurify release', () => {
  it('preserves readable formatting and safe external links', () => {
    const host = render('**Hello** [Documentation](https://example.com/docs)')
    expect(host.querySelector('strong')?.textContent).toBe('Hello')
    const link = host.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://example.com/docs')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('removes active content, event handlers and javascript URLs', () => {
    const host = render('<script>alert(1)</script><iframe src="https://example.com"></iframe><a href="javascript:alert(1)" onclick="alert(2)">Read</a><span onmouseover="alert(3)" data-secret="x">Text</span>')
    expect(host.querySelector('script, iframe, [onclick], [onmouseover], [data-secret]')).toBeNull()
    expect(host.querySelector('a')?.hasAttribute('href')).toBe(false)
    expect(host.textContent).toContain('Text')
  })

  it('keeps markdown images as links without allowing injected attributes', () => {
    const host = render('![Example](https://example.com/image.png)\n<img src=x onerror=alert(1)>')
    expect(host.querySelector('img, [onerror]')).toBeNull()
    expect(host.querySelector('a')?.textContent).toBe('[Image: Example]')
  })
})
