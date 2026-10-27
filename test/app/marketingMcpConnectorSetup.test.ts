// @vitest-environment happy-dom
import { createApp, h, ref, computed, nextTick, Suspense } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Connector from '../../app/pages/agency/ai/connectors.vue'

const data = ref<any>(null), pending = ref(false), error = ref<any>(null)
const refresh = vi.fn(), copy = vi.fn(), toast = vi.fn()
let app: ReturnType<typeof createApp>, element: HTMLDivElement
const fixture = () => ({ enabled: true, workerOrigin: 'https://fixture.example/', role: 'creative', preview: { assumedScopes: ['mcp:read', 'mcp:write'], projection: 'staff' }, access: { permissionGroups: ['CREATIVE'], readOnly: false, clientScope: { mode: 'assigned', assignedClientCount: 2 } }, marketingCapabilities: ['reporting'], tools: [{ name: 'get_campaign_breakdown', description: 'Stored campaigns', requiresWriteScope: false }] })
async function mount() {
  element = document.createElement('div')
  document.body.append(element)
  app = createApp({ render: () => h(Suspense, {}, { default: () => h(Connector) }) })
  for (const name of ['UDashboardPanel', 'UDashboardNavbar', 'UCard']) app.component(name, { setup: (_, { slots }) => () => h('section', [slots.header?.(), slots.trailing?.(), slots.default?.()]) })
  for (const name of ['UBadge', 'UIcon', 'UTabs']) app.component(name, { template: '<span><slot /></span>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<aside>{{ title }} {{ description }}<slot /></aside>' })
  app.component('UButton', { props: ['label', 'disabled', 'loading', 'to'], template: '<button :disabled="disabled || loading"><slot />{{ label }}</button>' })
  app.mount(element)
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function click(label: string) {
  const button = [...element.querySelectorAll('button')].find(b => b.textContent?.includes(label))
  expect(button).toBeTruthy()
  button!.click()
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
beforeEach(() => {
  data.value = fixture()
  pending.value = false
  error.value = null
  refresh.mockReset()
  copy.mockReset()
  toast.mockReset()
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('$fetch', async () => data.value)
  vi.stubGlobal('useFetch', () => ({ data, pending, error, refresh }))
  vi.stubGlobal('useClipboard', () => ({ copy, copied: ref(false) }))
  vi.stubGlobal('useToast', () => ({ add: toast }))
})
afterEach(() => {
  app?.unmount()
  element?.remove()
  vi.unstubAllGlobals()
})
describe('marketing connector setup', () => {
  it('labels assumed scopes and current access without asserting actual host or provider authorization', async () => {
    await mount()
    expect(element.textContent).toContain('Assumed scopes: mcp:read, mcp:write')
    expect(element.textContent).toContain('2 assigned active clients')
    expect(element.textContent).toContain('CREATIVE')
    expect(element.textContent).toContain('reporting')
    expect(element.textContent).toContain('not a live OAuth grant')
    expect(element.textContent).not.toContain('Prepare a social draft')
  })
  it('shows loading then an actionable error, hides stale tools, and recovers through retry', async () => {
    pending.value = true
    await mount()
    expect(element.textContent).toContain('Loading your access preview')
    expect(element.textContent).not.toContain('Stored campaigns')
    pending.value = false
    error.value = new Error('server failed')
    await nextTick()
    expect(element.textContent).toContain('Could not load your access preview')
    expect(element.textContent).not.toContain('Connector is currently turned off')
    expect(element.textContent).not.toContain('Stored campaigns')
    refresh.mockImplementation(async () => {
      error.value = null
      data.value = fixture()
    })
    await click('Retry')
    expect(element.textContent).toContain('Stored campaigns')
  })
  it('catches a rejected refresh and never presents the old preview as current', async () => {
    await mount()
    refresh.mockRejectedValue(new Error('refresh rejected'))
    await click('Refresh access')
    expect(element.textContent).toContain('Could not load your access preview')
    expect(element.textContent).not.toContain('Stored campaigns')
  })
  it('distinguishes all-active and empty assignment scope and read-only policy', async () => {
    data.value.access.clientScope = { mode: 'all_active', assignedClientCount: null }
    data.value.access.readOnly = true
    await mount()
    expect(element.textContent).toContain('All active clients')
    expect(element.textContent).toContain('Read-only policy')
    data.value = { ...fixture(), access: { ...fixture().access, clientScope: { mode: 'assigned', assignedClientCount: 0 } }, tools: [] }
    await nextTick()
    expect(element.textContent).toContain('No active client assignments')
    expect(element.textContent).toContain('Ask an administrator')
  })
  it('keeps owner authority separate and catches copy failure without a success toast', async () => {
    data.value = { enabled: true, role: 'owner', authority: 'god_mode', preview: { assumedScopes: ['mcp:read', 'mcp:write'], projection: 'owner' }, tools: [{ name: 'owner_tool', description: 'Owner catalog' }] }
    await mount()
    expect(element.textContent).toContain('Owner God mode is active')
    expect(element.textContent).not.toContain('No active client assignments')
    copy.mockRejectedValue(new Error('clipboard unavailable'))
    await click('Copy')
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })
})
