// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref } from 'vue'
import InboundEmailOnboarding from '~~/app/components/crm/InboundEmailOnboarding.vue'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ROUTE_ID = '22222222-2222-4222-8222-222222222222'
const ADDRESS = 'lead+one-time-token@leads.xeroflow.io'
const toastAdd = vi.fn()
const dataSourcesSource = readFileSync('app/components/crm/DataSources.vue', 'utf8')
const portalCrmSource = readFileSync('app/pages/portal/crm.vue', 'utf8')
const featureIndexSource = readFileSync('app/pages/features/index.vue', 'utf8')
const featureDetailSource = readFileSync('app/pages/features/[slug].vue', 'utf8')
const crmEmailPrdSource = readFileSync('docs/prd/crm-conversations-email-gateway-prd.md', 'utf8')
const crmEmailRunbookSource = readFileSync('docs/runbooks/crm-email-inbound.md', 'utf8')

function sourceSlice(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  if (startIndex === -1 || endIndex === -1) throw new Error(`Expected source range: ${start} … ${end}`)
  return source.slice(startIndex, endIndex)
}

const route = {
  id: ROUTE_ID,
  label: 'CRM inbox',
  kind: 'lead_inbox' as const,
  clientId: CLIENT_ID,
  recipientDomain: 'leads.xeroflow.io',
  status: 'never_used' as const,
  createdAt: '2026-07-31T00:00:00.000Z',
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  canRotate: true,
  canRevoke: true,
  addressAvailable: false as const
}

const replacementRoute = {
  ...route,
  id: '33333333-3333-4333-8333-333333333333',
  label: 'Rotated CRM inbox',
  createdAt: '2026-07-31T01:00:00.000Z'
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const panelStubs = {
  UAlert: { template: '<div><slot /><slot name="actions" /></div>' },
  UBadge: { template: '<span><slot /></span>' },
  UFormField: { template: '<label><slot /></label>' },
  UIcon: { template: '<i />' },
  UInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">'
  },
  UButton: {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  },
  UModal: {
    props: ['open'],
    emits: ['update:open'],
    template: '<div v-if="open" data-modal><slot name="content" /></div>'
  }
}

async function flushUi() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountPanel(fetchMock: ReturnType<typeof vi.fn>) {
  Object.assign(globalThis, { $fetch: fetchMock, useToast: () => ({ add: toastAdd }) })
  const state = reactive({ apiBase: '/api/crm/email-routes', clientId: CLIENT_ID as string | undefined, canManage: true })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(InboundEmailOnboarding, state) })
  Object.entries(panelStubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host, state }
}

function button(host: Element, label: string): HTMLButtonElement {
  const target = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label)
  if (!target) throw new Error(`Button not found: ${label}`)
  return target as HTMLButtonElement
}

function modalButton(host: Element, label: string): HTMLButtonElement {
  const modal = host.querySelector('[data-modal]')
  if (!modal) throw new Error('Modal not found')
  return button(modal, label)
}

describe('useCrmInboundEmailRoute', () => {
  beforeEach(() => {
    toastAdd.mockReset()
    vi.stubGlobal('useToast', () => ({ add: toastAdd }))
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('loads the safe list without ever receiving a reusable address', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ items: [route] })
    vi.stubGlobal('$fetch', fetchMock)
    const { useCrmInboundEmailRoute } = await import('~~/app/composables/useCrmInboundEmailRoute')
    const manager = useCrmInboundEmailRoute({ apiBase: '/api/crm/email-routes', clientId: CLIENT_ID })

    await manager.refresh()

    expect(fetchMock).toHaveBeenCalledWith('/api/crm/email-routes', {
      method: 'GET', query: { client_id: CLIENT_ID }
    })
    expect(manager.routes.value).toEqual([route])
    expect(JSON.stringify(manager.routes.value)).not.toContain('lead+')
    expect(manager.loadError.value).toBeNull()
    expect(manager.pending.value).toBe(false)
  })

  it('creates, rotates, and revokes with the correct agency and portal request shapes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ route, issuedAddress: ADDRESS, addressShownOnce: true })
      .mockResolvedValueOnce({ route: { ...route, label: 'Rotated inbox' }, issuedAddress: ADDRESS, addressShownOnce: true })
      .mockResolvedValueOnce({ route: { ...route, status: 'revoked', canRotate: false, canRevoke: false } })
    vi.stubGlobal('$fetch', fetchMock)
    const { useCrmInboundEmailRoute } = await import('~~/app/composables/useCrmInboundEmailRoute')
    const agency = useCrmInboundEmailRoute({ apiBase: '/api/crm/email-routes', clientId: CLIENT_ID })

    await expect(agency.create('CRM inbox')).resolves.toMatchObject({ issuedAddress: ADDRESS })
    await expect(agency.rotate(route)).resolves.toMatchObject({ issuedAddress: ADDRESS })
    await expect(agency.revoke(route)).resolves.toMatchObject({ route: { status: 'revoked' } })
    expect(fetchMock.mock.calls).toEqual([
      ['/api/crm/email-routes', { method: 'POST', body: { client_id: CLIENT_ID, label: 'CRM inbox' } }],
      [`/api/crm/email-routes/${ROUTE_ID}/rotate`, { method: 'POST', body: { client_id: CLIENT_ID } }],
      [`/api/crm/email-routes/${ROUTE_ID}`, { method: 'DELETE', body: { client_id: CLIENT_ID } }]
    ])

    const portalFetch = vi.fn().mockResolvedValue({ route, issuedAddress: ADDRESS, addressShownOnce: true })
    vi.stubGlobal('$fetch', portalFetch)
    const portal = useCrmInboundEmailRoute({ apiBase: '/api/client-portal/crm/email-routes' })
    await portal.create('Portal inbox')
    expect(portalFetch).toHaveBeenCalledWith('/api/client-portal/crm/email-routes', {
      method: 'POST', body: { label: 'Portal inbox' }
    })
  })

  it('keeps every portal request session-scoped without a client_id query or body', async () => {
    const portalFetch = vi.fn()
      .mockResolvedValueOnce({ items: [route] })
      .mockResolvedValueOnce({ route, issuedAddress: ADDRESS, addressShownOnce: true })
      .mockResolvedValueOnce({ route: replacementRoute, issuedAddress: ADDRESS, addressShownOnce: true })
      .mockResolvedValueOnce({ route: { ...replacementRoute, status: 'revoked', canRotate: false, canRevoke: false } })
    vi.stubGlobal('$fetch', portalFetch)
    const { useCrmInboundEmailRoute } = await import('~~/app/composables/useCrmInboundEmailRoute')
    const portal = useCrmInboundEmailRoute({ apiBase: '/api/client-portal/crm/email-routes' })

    await portal.refresh()
    await portal.create('Portal inbox')
    await portal.rotate(route)
    await portal.revoke(replacementRoute)

    expect(portalFetch.mock.calls).toEqual([
      ['/api/client-portal/crm/email-routes', { method: 'GET' }],
      ['/api/client-portal/crm/email-routes', { method: 'POST', body: { label: 'Portal inbox' } }],
      [`/api/client-portal/crm/email-routes/${ROUTE_ID}/rotate`, { method: 'POST', body: {} }],
      [`/api/client-portal/crm/email-routes/${replacementRoute.id}`, { method: 'DELETE', body: {} }]
    ])
    expect(JSON.stringify(portalFetch.mock.calls)).not.toContain('client_id')
  })

  it('reconciles rotation before revocation so a stale route cannot remain active', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ items: [route] })
      .mockResolvedValueOnce({ route: replacementRoute, issuedAddress: ADDRESS, addressShownOnce: true })
      .mockResolvedValueOnce({ route: { ...replacementRoute, status: 'revoked', canRotate: false, canRevoke: false } })
    vi.stubGlobal('$fetch', fetchMock)
    const { useCrmInboundEmailRoute } = await import('~~/app/composables/useCrmInboundEmailRoute')
    const manager = useCrmInboundEmailRoute({ apiBase: '/api/crm/email-routes', clientId: CLIENT_ID })

    await manager.refresh()
    await manager.rotate(route)
    expect(manager.routes.value).toEqual([replacementRoute])

    await manager.revoke(replacementRoute)
    expect(fetchMock.mock.calls[2]).toEqual([
      `/api/crm/email-routes/${replacementRoute.id}`,
      { method: 'DELETE', body: { client_id: CLIENT_ID } }
    ])
    expect(manager.routes.value).toEqual([expect.objectContaining({ id: replacementRoute.id, status: 'revoked' })])
  })

  it('does not let an older refresh overwrite a completed mutation', async () => {
    const list = deferred<{ items: typeof route[] }>()
    const fetchMock = vi.fn((request: string, options?: { method?: string }) => {
      if (request === '/api/crm/email-routes' && options?.method === 'GET') return list.promise
      return Promise.resolve({ route: replacementRoute, issuedAddress: ADDRESS, addressShownOnce: true })
    })
    vi.stubGlobal('$fetch', fetchMock)
    const { useCrmInboundEmailRoute } = await import('~~/app/composables/useCrmInboundEmailRoute')
    const manager = useCrmInboundEmailRoute({ apiBase: '/api/crm/email-routes', clientId: CLIENT_ID })

    const refresh = manager.refresh()
    await manager.create('Rotated CRM inbox')
    list.resolve({ items: [route] })
    await refresh

    expect(manager.routes.value).toEqual([replacementRoute])
    expect(manager.pending.value).toBe(false)
  })

  it('surfaces a load failure and keeps the existing safe list available', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ items: [route] })
      .mockRejectedValueOnce({ data: { statusMessage: 'Service unavailable' } })
    vi.stubGlobal('$fetch', fetchMock)
    const { useCrmInboundEmailRoute } = await import('~~/app/composables/useCrmInboundEmailRoute')
    const manager = useCrmInboundEmailRoute({ apiBase: '/api/crm/email-routes', clientId: CLIENT_ID })

    await manager.refresh()
    await manager.refresh()

    expect(manager.routes.value).toEqual([route])
    expect(manager.loadError.value).toBe('Service unavailable')
  })

  it('copies the revealed address and reports clipboard failures without clearing it', async () => {
    const clipboard = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } })
    vi.stubGlobal('$fetch', vi.fn())
    const { useCrmInboundEmailRoute } = await import('~~/app/composables/useCrmInboundEmailRoute')
    const manager = useCrmInboundEmailRoute({ apiBase: '/api/crm/email-routes', clientId: CLIENT_ID })
    const issuedAddress = ref(ADDRESS)

    await expect(manager.copyAddress(issuedAddress.value)).resolves.toBe(true)
    expect(clipboard).toHaveBeenCalledWith(ADDRESS)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Address copied', color: 'success' }))

    clipboard.mockRejectedValueOnce(new Error('Clipboard blocked'))
    await expect(manager.copyAddress(issuedAddress.value)).resolves.toBe(false)
    expect(issuedAddress.value).toBe(ADDRESS)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Copy failed', color: 'error' }))
  })
})

describe('CRM inbound email onboarding mounted behavior', () => {
  beforeEach(() => {
    toastAdd.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('uses the new API/client context and clears an issued address when props change', async () => {
    const fetchMock = vi.fn((request: string) => {
      if (request === '/api/crm/email-routes') return Promise.resolve({ items: [route] })
      if (request === `/api/crm/email-routes/${route.id}/rotate`) {
        return Promise.resolve({ route: replacementRoute, issuedAddress: ADDRESS, addressShownOnce: true })
      }
      if (request === '/api/client-portal/crm/email-routes') return Promise.resolve({ items: [] })
      throw new Error(`Unexpected request: ${request}`)
    })
    const mounted = mountPanel(fetchMock)
    await flushUi()

    button(mounted.host, 'Rotate address').click()
    await flushUi()
    modalButton(mounted.host, 'Rotate address').click()
    await flushUi()
    expect((mounted.host.querySelector('input') as HTMLInputElement | null)?.value).toBe(ADDRESS)

    mounted.state.apiBase = '/api/client-portal/crm/email-routes'
    mounted.state.clientId = undefined
    await flushUi()

    expect((mounted.host.querySelector('input') as HTMLInputElement | null)?.value).not.toBe(ADDRESS)
    expect(mounted.host.querySelector('[data-modal]')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/client-portal/crm/email-routes', { method: 'GET' })
    mounted.app.unmount()
  })

  it('closes a confirmation and prevents the mutation if permission is lost', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ items: [route] })
    const mounted = mountPanel(fetchMock)
    await flushUi()

    button(mounted.host, 'Rotate address').click()
    await flushUi()
    expect(mounted.host.querySelector('[data-modal]')).not.toBeNull()

    mounted.state.canManage = false
    await flushUi()
    expect(mounted.host.querySelector('[data-modal]')).toBeNull()
    expect([...fetchMock.mock.calls].filter(([request]) => String(request).includes('/rotate'))).toHaveLength(0)
    mounted.app.unmount()
  })
})

describe('CRM inbound email onboarding panel composition', () => {
  const source = () => readFileSync('app/components/crm/InboundEmailOnboarding.vue', 'utf8')

  it('uses Nuxt UI controls, labelled reveal fields, confirmations, and a container-safe form', () => {
    const panel = source()
    expect(panel).toContain('<UFormField label="Inbox label"')
    expect(panel).toContain('<UInput')
    expect(panel).toContain('<UModal')
    expect(panel).toMatch(/<form[^>]*class="@container/)
    expect(panel).toContain('grid grid-cols-1 gap-4 @lg:grid-cols-2')
    expect(panel).not.toContain('grid grid-cols-2')
    expect(panel).not.toMatch(/<(?:input|select|button|dialog)\b/i)
  })

  it('covers empty, issued, awaiting, ready, revoked, and error states without persisting an address', () => {
    const panel = source()
    for (const state of [
      'No CRM inbox address yet', 'Copy this address now. For security, XeroFlow cannot show it again.',
      'Awaiting first message', 'Ready for inbound CRM email', 'Revoked', 'Email routes could not be loaded'
    ]) expect(panel).toContain(state)
    expect(panel).toContain('const issuedAddress = ref<string | null>(null)')
    expect(panel).toContain('function dismissIssuedAddress()')
    expect(panel).toMatch(/async function refresh\(\) \{\s*clearTransientState\(\)/)
    expect(panel).not.toContain('useState')
    expect(panel).not.toContain('localStorage')
    expect(panel).not.toContain('sessionStorage')
    expect(panel).not.toContain('analytics')
  })

  it('keeps the address row usable at 320px and uses local Lucide icons with an accessible copy action', () => {
    const panel = source()
    expect(panel).toContain('min-w-0')
    expect(panel).toContain('shrink-0')
    expect(panel).toContain('aria-label="Copy inbound email address"')
    const icons = [...panel.matchAll(/i-[a-z0-9-]+/g)].map(match => match[0])
    expect(icons.length).toBeGreaterThan(0)
    expect(icons.every(icon => icon.startsWith('i-lucide-'))).toBe(true)
    expect(panel).toContain('The current address stops working as soon as rotation completes.')
  })
})

describe('CRM inbound email onboarding placement and portal access', () => {
  it('places inbound email onboarding before inventory data sources', () => {
    expect(dataSourcesSource.indexOf('<CrmInboundEmailOnboarding')).toBeLessThan(
      dataSourcesSource.indexOf('<div class="grid gap-4 xl:grid-cols-3">')
    )
  })

  it('uses the dedicated portal route API without passing portal tenancy to it', () => {
    expect(dataSourcesSource).toMatch(/<CrmInboundEmailOnboarding\s+v-if="isPortalDataSources"[\s\S]{0,240}api-base="\/api\/client-portal\/crm\/email-routes"/)
    expect(dataSourcesSource).toMatch(/<CrmInboundEmailOnboarding\s+v-if="isPortalDataSources"[\s\S]{0,240}:key="`inbound-email-\$\{clientId\}`"/)
    const portalPanel = dataSourcesSource.split('<CrmInboundEmailOnboarding')[1]
    expect(portalPanel).not.toContain(':client-id=')
  })

  it('allows CRM administrators or the primary contact to manage, while viewers retain safe status', () => {
    expect(portalCrmSource).toContain('user.value?.isPrimaryContact || user.value?.permissions?.canAdminCrm')
    expect(portalCrmSource).not.toContain('canInviteUsers')
    expect(dataSourcesSource).toContain(':can-manage="canManage"')
    expect(dataSourcesSource).toContain('api-base="/api/client-portal/crm/email-routes"')
  })
})

describe('CRM inbound email public feature copy', () => {
  it('explains dedicated inbound email, client-scoped conversation capture, and one-time secure issuance', () => {
    const leadCaptureIndex = sourceSlice(featureIndexSource, '{ title: \'Lead Capture & Routing\'', '{ title: \'Xero Integration\'')
    const crmActivitiesDetail = sourceSlice(featureDetailSource, '\'crm-activities\': {', '\'crm-scoring\': {')
    const leadCaptureDetail = sourceSlice(featureDetailSource, '\'lead-capture-routing\': {', '\'xero-integration\': {')

    expect(leadCaptureIndex).toContain('Dedicated inbound email securely captures each client\\\'s CRM conversation')
    expect(crmActivitiesDetail).toContain('Dedicated inbound email securely captures each client\\\'s CRM conversation')
    expect(leadCaptureDetail).toContain('shown once when created or rotated')
  })
})

describe('CRM inbound email operational documentation', () => {
  it('retains old signing keys through queue drain and uses an explicitly revoked smoke route', () => {
    expect(crmEmailPrdSource).toContain('inbound Queue has drained')
    expect(crmEmailRunbookSource).toContain('inbound Queue has drained')
    expect(crmEmailRunbookSource).toContain('clearly labelled `lead_inbox` smoke route')
    expect(crmEmailRunbookSource).toContain('does not expire automatically')
    expect(crmEmailRunbookSource).not.toContain('24-hour `lead_inbox` smoke route')
  })
})
