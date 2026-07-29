// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import {
  buildCreateEmailEndpointBody,
  buildUpdateEmailEndpointBody,
  classifyEmailEndpointHealth,
  normalizeEmailEndpointPrefixInput,
  routingPresetPreview,
  type EmailEndpointDraft,
  type SafeEmailLeadEndpoint
} from '~~/app/utils/emailEndpointUi'
import EmailEndpointsTab from '~~/app/components/leads/EmailEndpointsTab.vue'
import { useEmailEndpointsManager } from '~~/app/composables/useEmailEndpointsManager'

const pageSource = readFileSync('app/pages/agency/leads/index.vue', 'utf8')
const tabSource = readFileSync('app/components/leads/EmailEndpointsTab.vue', 'utf8')
const tableSource = readFileSync('app/components/leads/EmailEndpointsTable.vue', 'utf8')
const confirmationSource = readFileSync('app/components/leads/EmailEndpointConfirmationModals.vue', 'utf8')
const slideoverSource = readFileSync('app/components/leads/EmailEndpointSlideover.vue', 'utf8')
const presetConfirmationSource = readFileSync('app/components/leads/EmailEndpointPresetConfirmation.vue', 'utf8')
const detailsSource = readFileSync('app/components/leads/EmailEndpointDetailsFields.vue', 'utf8')
const policySource = readFileSync('app/components/leads/EmailEndpointPolicyFields.vue', 'utf8')
const routingSource = readFileSync('app/components/leads/EmailEndpointRoutingFields.vue', 'utf8')
const managerSource = readFileSync('app/composables/useEmailEndpointsManager.ts', 'utf8')
const formSource = `${slideoverSource}\n${detailsSource}\n${policySource}\n${routingSource}`
const tableFeatureSource = `${tabSource}\n${tableSource}\n${confirmationSource}\n${managerSource}`
const confirmationFeatureSource = `${confirmationSource}\n${presetConfirmationSource}`
const badgeSource = readFileSync('app/components/leads/EmailIngestionStatusBadge.vue', 'utf8')

const endpoint: SafeEmailLeadEndpoint = {
  id: '33333333-3333-4333-8333-333333333333',
  client_id: '11111111-1111-4111-8111-111111111111',
  label: 'carsales',
  address_prefix: 'carsales',
  email_address: 'carsales-0123456789@leads.xeroflow.io',
  expected_provider: 'carsales',
  parser_mode: 'auto',
  ai_extraction_mode: 'disabled',
  allowed_sender_domains: ['carsales.com.au'],
  expected_max_silence_hours: 24,
  first_response_sla_minutes: 30,
  form_id: 'email_endpoint:33333333-3333-4333-8333-333333333333',
  form_name: 'Carsales enquiries',
  enabled: true,
  last_received_at: '2026-07-28T10:00:00.000Z',
  last_accepted_at: '2026-07-28T10:00:01.000Z',
  last_failure_at: null,
  consecutive_failures: 0,
  retired_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-28T10:00:01.000Z'
}

const draft: EmailEndpointDraft = {
  clientId: endpoint.client_id,
  label: 'Carsales NSW',
  addressPrefix: 'carsales-nsw',
  expectedProvider: 'carsales',
  parserMode: 'adf',
  aiExtractionMode: 'disabled',
  allowedSenderDomains: ['carsales.com.au'],
  cadence: 'daily',
  customSilenceHours: null,
  firstResponseSlaMinutes: 30,
  formName: 'Carsales NSW enquiries',
  routingPreset: 'portal_notification',
  notificationEmail: 'leads@example.test',
  assignedUserId: 'none'
}

describe('agency leads email addresses composition', () => {
  it('adds Email addresses without replacing Inbox or Form rules', () => {
    expect(pageSource).toContain("{ value: 'inbox', label: 'Inbox'")
    expect(pageSource).toContain("{ value: 'rules', label: 'Form rules'")
    expect(pageSource).toContain("{ value: 'email', label: 'Email addresses'")
    expect(pageSource).toContain('<LeadsInbox')
    expect(pageSource).toContain('<LeadsFormRulesTab')
    expect(pageSource).toContain('<LeadsEmailEndpointsTab')
  })

  it('uses Nuxt UI v4 controls, labelled fields, and responsive form grids only', () => {
    for (const source of [tabSource, slideoverSource, detailsSource, policySource, routingSource]) {
      expect(source).not.toMatch(/<(?:input|select|button|dialog)\b/i)
    }
    expect(slideoverSource).toContain('<USlideover')
    for (const label of [
      'Client', 'Label', 'Address prefix', 'Expected provider', 'Form name',
      'Parser mode', 'AI fallback', 'Allowed sender domains', 'Expected cadence',
      'First-response SLA', 'Routing preset'
    ]) {
      expect(formSource).toMatch(new RegExp(`<UFormField[\\s\\S]{0,120}label="${label}"`))
    }
    expect(slideoverSource).toContain('<form class="@container space-y-6"')
    expect(formSource).toContain('grid grid-cols-1 gap-4 @lg:grid-cols-2')
    expect(formSource).toContain('@lg:col-span-2')
    expect(formSource).not.toContain('sm:grid-cols-2')
    expect(formSource).not.toContain('sm:col-span-2')
    expect(formSource).toContain('<UInputTags')
    expect(formSource).toContain('class="w-full"')
  })

  it('renders the exact section 6.2 choices and honest platform/API limitations', () => {
    for (const label of [
      'Auto', 'ADF/XML', 'Generic labelled',
      'No expectation', 'Hourly', 'Daily', 'Weekly', 'Custom max silence',
      'Client portal', 'Portal + email notification', 'Assign user'
    ]) {
      expect(formSource).toContain(label)
    }
    expect(formSource).toContain('AI fallback is unavailable until the platform capability is exposed')
    expect(slideoverSource).toContain('Raw email is encrypted and retained for 7 days when quarantine is required.')
    expect(slideoverSource).toContain('Form ID')
    expect(formSource).toContain('Routing customisation state is not supplied by the safe endpoint API')
    expect(formSource).not.toMatch(/value:\s*['"]{2}/)
  })

  it('uses local Lucide icons and exposes all table states and agency actions', () => {
    const iconValues = [...`${pageSource}\n${tableFeatureSource}\n${formSource}\n${confirmationFeatureSource}\n${badgeSource}`.matchAll(/i-[a-z0-9-]+/g)]
      .map(match => match[0])
    expect(iconValues.length).toBeGreaterThan(0)
    expect(iconValues.every(icon => icon.startsWith('i-lucide-'))).toBe(true)

    for (const content of [
      'Client', 'Address', 'Label', 'Provider', 'Form', 'Last message', 'Health', 'Recovery',
      'Copy address', 'Edit endpoint', 'Disable endpoint', 'Enable endpoint',
      'Rotate address', 'Retire endpoint', 'Open form rule',
      'Loading email endpoints', 'No email addresses', 'Access denied',
      'Email addresses could not be loaded', 'Retry'
    ]) {
      expect(tableFeatureSource).toContain(content)
    }
    expect(tableFeatureSource).toContain('Not supplied by endpoint list API')
    expect(tableFeatureSource).toContain('navigator.clipboard.writeText')
    expect(tableFeatureSource).toContain('/api/leads/email-endpoints')
  })

  it('uses explicit confirmation modals for preset application, rotation, and retirement', () => {
    expect(presetConfirmationSource).toContain('<UModal')
    expect(presetConfirmationSource).toContain('Confirm routing preset')
    expect(slideoverSource).toContain('showPresetConfirmation')
    expect(confirmationSource.match(/<UModal/g)).toHaveLength(2)
    expect(confirmationSource).toContain('Rotate email address?')
    expect(confirmationSource).toContain('Retire email address?')
    expect(confirmationSource).toContain('The current address remains valid for 24 hours')
    expect(confirmationSource).toContain('Retirement is permanent')
    expect(confirmationFeatureSource).toContain('autofocus')
  })
})

describe('email endpoint UI contract mapping', () => {
  it('normalizes optional address prefixes to bounded lower-case ASCII', () => {
    expect(normalizeEmailEndpointPrefixInput('  Cárs & Trucks NSW  ')).toBe('cars-trucks-nsw')
    expect(normalizeEmailEndpointPrefixInput('A'.repeat(40))).toBe('a'.repeat(32))
  })

  it('maps sentinels and cadence to the exact create API payload', () => {
    expect(buildCreateEmailEndpointBody(draft)).toEqual({
      client_id: endpoint.client_id,
      label: 'Carsales NSW',
      address_prefix: 'carsales-nsw',
      expected_provider: 'carsales',
      parser_mode: 'adf',
      ai_extraction_mode: 'disabled',
      allowed_sender_domains: ['carsales.com.au'],
      expected_max_silence_hours: 24,
      first_response_sla_minutes: 30,
      form_name: 'Carsales NSW enquiries',
      routing_preset: 'portal_notification',
      notification_email: 'leads@example.test'
    })

    expect(buildCreateEmailEndpointBody({
      ...draft,
      addressPrefix: '',
      expectedProvider: 'none',
      cadence: 'none',
      firstResponseSlaMinutes: null,
      routingPreset: 'none'
    })).toEqual({
      client_id: endpoint.client_id,
      label: 'Carsales NSW',
      expected_provider: null,
      parser_mode: 'adf',
      ai_extraction_mode: 'disabled',
      allowed_sender_domains: ['carsales.com.au'],
      expected_max_silence_hours: null,
      first_response_sla_minutes: null,
      form_name: 'Carsales NSW enquiries'
    })
  })

  it('never sends create-only client or routing fields to the patch API', () => {
    expect(buildUpdateEmailEndpointBody(draft)).toEqual({
      label: 'Carsales NSW',
      address_prefix: 'carsales-nsw',
      expected_provider: 'carsales',
      parser_mode: 'adf',
      ai_extraction_mode: 'disabled',
      allowed_sender_domains: ['carsales.com.au'],
      expected_max_silence_hours: 24,
      first_response_sla_minutes: 30,
      form_name: 'Carsales NSW enquiries'
    })
  })

  it('previews the exact destinations created by each supported preset', () => {
    expect(routingPresetPreview({ ...draft, routingPreset: 'none' }, [])).toEqual([])
    expect(routingPresetPreview({ ...draft, routingPreset: 'portal' }, [])).toEqual([
      'Client portal'
    ])
    expect(routingPresetPreview(draft, [])).toEqual([
      'Client portal',
      'Email notification · leads@example.test'
    ])
    expect(routingPresetPreview({
      ...draft,
      routingPreset: 'assign_user',
      assignedUserId: '22222222-2222-4222-8222-222222222222'
    }, [{ id: '22222222-2222-4222-8222-222222222222', name: 'Avery Smith' }])).toEqual([
      'Assign user · Avery Smith'
    ])
  })
})

describe('cadence-aware email endpoint health', () => {
  const now = Date.parse('2026-07-29T10:00:00.000Z')

  it('prioritises immutable lifecycle and failure states', () => {
    expect(classifyEmailEndpointHealth({ ...endpoint, retired_at: '2026-07-29T00:00:00.000Z' }, now))
      .toMatchObject({ label: 'Retired', color: 'neutral' })
    expect(classifyEmailEndpointHealth({ ...endpoint, enabled: false }, now))
      .toMatchObject({ label: 'Disabled', color: 'neutral' })
    expect(classifyEmailEndpointHealth({ ...endpoint, consecutive_failures: 2 }, now))
      .toMatchObject({ label: 'Needs attention', color: 'error' })
  })

  it('distinguishes overdue, healthy, awaiting-first-message, and no-expectation endpoints', () => {
    expect(classifyEmailEndpointHealth(endpoint, now))
      .toMatchObject({ label: 'Overdue', color: 'warning' })
    expect(classifyEmailEndpointHealth({
      ...endpoint,
      last_received_at: '2026-07-29T09:30:00.000Z'
    }, now)).toMatchObject({ label: 'Healthy', color: 'success' })
    expect(classifyEmailEndpointHealth({ ...endpoint, last_received_at: null }, now))
      .toMatchObject({ label: 'Awaiting first message', color: 'info' })
    expect(classifyEmailEndpointHealth({ ...endpoint, expected_max_silence_hours: null }, now))
      .toMatchObject({ label: 'Active', color: 'info' })
  })
})

function mountEmailEndpoints(fetchMock: ReturnType<typeof vi.fn>) {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  Object.assign(globalThis, {
    $fetch: fetchMock,
    useToast: () => ({ add: vi.fn() })
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(EmailEndpointsTab) })
  app.component('UButton', {
    props: ['label'],
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')">{{ label }}<slot /></button>'
  })
  app.component('UFormField', {
    props: ['label'],
    template: '<label>{{ label }}<slot /></label>'
  })
  app.component('USelectMenu', {
    props: ['modelValue'],
    template: '<div data-select>{{ modelValue }}</div>'
  })
  app.component('USkeleton', { template: '<div data-skeleton />' })
  app.component('UAlert', {
    props: ['title', 'description'],
    template: '<div role="alert">{{ title }} {{ description }}</div>'
  })
  app.component('UIcon', { props: ['name'], template: '<i :data-icon="name" />' })
  app.component('UTooltip', { template: '<span><slot /></span>' })
  app.component('UTable', {
    props: ['data'],
    template: '<div data-table :data-count="data.length" />'
  })
  app.component('UDropdownMenu', { template: '<div><slot /></div>' })
  app.component('UModal', { template: '<div />' })
  app.component('LeadsEmailEndpointSlideover', { template: '<div data-slideover />' })
  app.component('LeadsEmailEndpointsTable', {
    props: ['endpoints'],
    template: '<div data-table :data-count="endpoints.length" />'
  })
  app.component('LeadsEmailEndpointConfirmationModals', { template: '<div data-confirmations />' })
  app.component('LeadsEmailIngestionStatusBadge', { template: '<span data-health />' })
  app.mount(host)
  return {
    host,
    consoleError,
    consoleWarn,
    async flush() {
      for (let index = 0; index < 6; index += 1) {
        await Promise.resolve()
        await nextTick()
      }
    },
    cleanup() {
      app.unmount()
      host.remove()
      consoleError.mockRestore()
      consoleWarn.mockRestore()
    }
  }
}

function endpointFetch(items: SafeEmailLeadEndpoint[]) {
  return vi.fn(async (request: string) => {
    if (request === '/api/agency/clients') {
      return [{ id: endpoint.client_id, name: 'Northside Motors' }]
    }
    if (request === '/api/agency/team-members') return { members: [] }
    if (request === '/api/leads/email-endpoints') return { items }
    throw new Error(`Unexpected request: ${request}`)
  })
}

describe('email endpoint component DOM smoke', () => {
  it('loads only agency-safe client-scoped list data and renders without console errors', async () => {
    const fetchMock = endpointFetch([endpoint])
    const mounted = mountEmailEndpoints(fetchMock)
    expect(mounted.host.querySelectorAll('[data-skeleton]')).toHaveLength(6)
    await mounted.flush()
    expect(fetchMock).toHaveBeenCalledWith('/api/leads/email-endpoints', {
      method: 'GET',
      query: { client_id: endpoint.client_id }
    })
    expect(mounted.host.querySelector('[data-table]')?.getAttribute('data-count')).toBe('1')
    expect(mounted.consoleError).not.toHaveBeenCalled()
    expect(mounted.consoleWarn).not.toHaveBeenCalled()
    mounted.cleanup()
  })

  it.each([
    ['empty', endpointFetch([]), 'No email addresses'],
    ['forbidden', vi.fn(async () => { throw { statusCode: 403 } }), 'Access denied'],
    ['error', vi.fn(async () => { throw new Error('network unavailable') }), 'Email addresses could not be loaded']
  ])('renders the %s state without console errors', async (_state, fetchMock, expectedText) => {
    const mounted = mountEmailEndpoints(fetchMock)
    await mounted.flush()
    expect(mounted.host.textContent).toContain(expectedText)
    expect(mounted.consoleError).not.toHaveBeenCalled()
    expect(mounted.consoleWarn).not.toHaveBeenCalled()
    mounted.cleanup()
  })
})

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function mountEmailEndpointsManager(fetchMock: ReturnType<typeof vi.fn>) {
  Object.assign(globalThis, {
    $fetch: fetchMock,
    useToast: () => ({ add: vi.fn() })
  })
  let manager!: ReturnType<typeof useEmailEndpointsManager>
  const host = document.createElement('div')
  const app = createApp({
    setup() {
      manager = useEmailEndpointsManager(vi.fn())
      return () => h('div')
    }
  })
  app.mount(host)
  return {
    manager,
    cleanup: () => app.unmount()
  }
}

async function flushPromises() {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

const newerEndpoint: SafeEmailLeadEndpoint = {
  ...endpoint,
  id: '44444444-4444-4444-8444-444444444444',
  client_id: '22222222-2222-4222-8222-222222222222',
  label: 'newer snapshot',
  email_address: 'newer-0123456789@leads.xeroflow.io'
}

describe('email endpoint refresh ordering', () => {
  it('keeps a fast second success when the first success resolves later', async () => {
    const firstClients = deferred<Array<{ id: string, name: string }>>()
    const firstTeam = deferred<{ members: Array<{ id: string, name: string }> }>()
    let clientCalls = 0
    let teamCalls = 0
    const fetchMock = vi.fn((request: string, options?: { query?: { client_id?: string } }) => {
      if (request === '/api/agency/clients') {
        clientCalls += 1
        return clientCalls === 1
          ? firstClients.promise
          : Promise.resolve([{ id: newerEndpoint.client_id, name: 'New client' }])
      }
      if (request === '/api/agency/team-members') {
        teamCalls += 1
        return teamCalls === 1
          ? firstTeam.promise
          : Promise.resolve({ members: [{ id: 'new-user', name: 'New user' }] })
      }
      if (request === '/api/leads/email-endpoints' && options?.query?.client_id === newerEndpoint.client_id) {
        return Promise.resolve({ items: [newerEndpoint] })
      }
      if (request === '/api/leads/email-endpoints') return Promise.resolve({ items: [endpoint] })
      throw new Error(`Unexpected request: ${request}`)
    })
    const mounted = mountEmailEndpointsManager(fetchMock)
    const secondRefresh = mounted.manager.refresh()
    await secondRefresh
    firstClients.resolve([{ id: endpoint.client_id, name: 'Old client' }])
    firstTeam.resolve({ members: [{ id: 'old-user', name: 'Old user' }] })
    await flushPromises()

    expect(mounted.manager.clients.value).toEqual([{ id: newerEndpoint.client_id, name: 'New client' }])
    expect(mounted.manager.team.value).toEqual([{ id: 'new-user', name: 'New user' }])
    expect(mounted.manager.filteredEndpoints.value).toEqual([newerEndpoint])
    mounted.cleanup()
  })

  it('ignores an old 403 that arrives after a newer success', async () => {
    const firstClients = deferred<Array<{ id: string, name: string }>>()
    let clientCalls = 0
    const fetchMock = vi.fn((request: string) => {
      if (request === '/api/agency/clients') {
        clientCalls += 1
        return clientCalls === 1
          ? firstClients.promise
          : Promise.resolve([{ id: newerEndpoint.client_id, name: 'New client' }])
      }
      if (request === '/api/agency/team-members') return Promise.resolve({ members: [] })
      if (request === '/api/leads/email-endpoints') return Promise.resolve({ items: [newerEndpoint] })
      throw new Error(`Unexpected request: ${request}`)
    })
    const mounted = mountEmailEndpointsManager(fetchMock)
    await mounted.manager.refresh()
    firstClients.reject({ statusCode: 403 })
    await flushPromises()

    expect(mounted.manager.forbidden.value).toBe(false)
    expect(mounted.manager.loadError.value).toBeNull()
    expect(mounted.manager.filteredEndpoints.value).toEqual([newerEndpoint])
    mounted.cleanup()
  })

  it('keeps a newer error when an old success resolves afterwards', async () => {
    const firstClients = deferred<Array<{ id: string, name: string }>>()
    const firstTeam = deferred<{ members: Array<{ id: string, name: string }> }>()
    let clientCalls = 0
    let teamCalls = 0
    const fetchMock = vi.fn((request: string) => {
      if (request === '/api/agency/clients') {
        clientCalls += 1
        return clientCalls === 1
          ? firstClients.promise
          : Promise.reject(new Error('new request failed'))
      }
      if (request === '/api/agency/team-members') {
        teamCalls += 1
        return teamCalls === 1 ? firstTeam.promise : Promise.resolve({ members: [] })
      }
      if (request === '/api/leads/email-endpoints') return Promise.resolve({ items: [endpoint] })
      throw new Error(`Unexpected request: ${request}`)
    })
    const mounted = mountEmailEndpointsManager(fetchMock)
    await mounted.manager.refresh()
    firstClients.resolve([{ id: endpoint.client_id, name: 'Old client' }])
    firstTeam.resolve({ members: [{ id: 'old-user', name: 'Old user' }] })
    await flushPromises()

    expect(mounted.manager.loadError.value).toBe('new request failed')
    expect(mounted.manager.clients.value).toEqual([])
    expect(mounted.manager.team.value).toEqual([])
    expect(mounted.manager.filteredEndpoints.value).toEqual([])
    mounted.cleanup()
  })

  it('keeps pending tied to the current request when an older request finishes first', async () => {
    const firstClients = deferred<Array<{ id: string, name: string }>>()
    const secondClients = deferred<Array<{ id: string, name: string }>>()
    let clientCalls = 0
    const fetchMock = vi.fn((request: string) => {
      if (request === '/api/agency/clients') {
        clientCalls += 1
        return clientCalls === 1 ? firstClients.promise : secondClients.promise
      }
      if (request === '/api/agency/team-members') return Promise.resolve({ members: [] })
      if (request === '/api/leads/email-endpoints') return Promise.resolve({ items: [] })
      throw new Error(`Unexpected request: ${request}`)
    })
    const mounted = mountEmailEndpointsManager(fetchMock)
    const secondRefresh = mounted.manager.refresh()
    firstClients.resolve([{ id: endpoint.client_id, name: 'Old client' }])
    await flushPromises()
    expect(mounted.manager.pending.value).toBe(true)

    secondClients.resolve([{ id: newerEndpoint.client_id, name: 'New client' }])
    await secondRefresh
    expect(mounted.manager.pending.value).toBe(false)
    mounted.cleanup()
  })
})
