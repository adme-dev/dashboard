// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref } from 'vue'
import ClientForm from '~~/app/components/agency/ClientForm.vue'

const apps: Array<{ unmount: () => void }> = []
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
async function submit(clients: boolean, marketing = false) {
  const fetch = vi.fn(async () => ({}))
  vi.stubGlobal('$fetch', fetch)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('reactive', reactive)
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('useAuth', () => ({ canAccessClients: ref(clients), canAccessFinance: ref(false), isManager: ref(false), hasPermission: (group: string) => marketing && group === 'MARKETING_MANAGEMENT' }))
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(ClientForm, { client: { id: 'client-id', name: 'Client', billingType: 'project', paymentTerms: 30, hourlyRate: 150 } })
  for (const name of ['UInput', 'UTextarea', 'USelectMenu', 'URadioGroup', 'UButton']) app.component(name, { render: () => h('span') })
  app.component('UFormField', { props: ['label'], setup: (props, { slots }) => () => h('label', [props.label, slots.default?.()]) })
  apps.push(app)
  app.mount(host)
  host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await nextTick()
  await Promise.resolve()
  return { host, fetch }
}
describe('client commercial form authority', () => {
  it('renders and submits account-manager commercial terms without company Finance', async () => {
    const { host, fetch } = await submit(true)
    expect(host.textContent).toContain('Billing Type')
    expect(host.textContent).toContain('Payment Terms')
    expect(fetch).toHaveBeenCalledWith('/api/agency/clients/client-id', expect.objectContaining({ body: expect.objectContaining({ billingType: 'project', paymentTerms: 30, hourlyRate: 150 }) }))
  })
  it.each([false, true])('omits hidden financial defaults for restricted metadata form; marketing=%s', async (marketing) => {
    const { host, fetch } = await submit(marketing, marketing)
    expect(host.textContent).not.toContain('Billing Type')
    expect(fetch).toHaveBeenCalledWith('/api/agency/clients/client-id', expect.objectContaining({ body: { name: 'Client', reportingTimezone: 'Australia/Brisbane' } }))
  })
})
