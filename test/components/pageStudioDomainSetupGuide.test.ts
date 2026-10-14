// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, nextTick, ref } from 'vue'
import Guide from '~~/app/components/page-studio/DomainSetupGuide.vue'

let app: ReturnType<typeof createApp>
let host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('ref', ref)
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(Guide)
  app.component('UButton', {
    props: ['label', 'to'], emits: ['click'],
    template: '<a v-if="to" :href="to">{{ label }}</a><button v-else @click="$emit(\'click\')">{{ label }}</button>'
  })
  app.mount(host)
})
afterEach(() => {
  app.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('customer domain setup choices', () => {
  it('starts with existing DNS and preserves email guidance', () => {
    expect(host.textContent).toContain('Keep your domain where it is')
    expect(host.textContent).toContain('Keep your MX records')
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe('Use my existing domain')
    expect(host.querySelector('a')).toBeNull()
  })
  it.each([
    ['Move DNS to Cloudflare', 'Use Cloudflare for your DNS', 'https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/'],
    ['Transfer my registration', 'Move registration to Cloudflare', 'https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/'],
    ['Buy a new domain', 'Find your new website address', 'https://dash.cloudflare.com/?to=/:account/registrar/register']
  ])('switches to %s with an explicit external handoff', async (label, title, url) => {
    Array.from(host.querySelectorAll('button')).find(button => button.textContent === label)!.click()
    await nextTick()
    expect(host.textContent).toContain(title)
    expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
    const link = host.querySelector('a')!
    expect(link.getAttribute('href')).toBe(url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(host.textContent).toContain('return here')
  })
})
