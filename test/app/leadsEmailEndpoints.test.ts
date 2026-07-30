// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import {
  buildCreateEmailEndpointBody,
  buildUpdateEmailEndpointBody,
  classifyEmailEndpointHealth,
  classifyEmailEndpointRecovery,
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
const rulesSource = readFileSync('app/components/leads/FormRulesTab.vue', 'utf8')
const filtersSource = readFileSync('app/components/leads/InboxFilters.vue', 'utf8')
const sourceIconSource = readFileSync('app/components/leads/SourceIcon.vue', 'utf8')
const leadDetailSource = readFileSync('app/components/leads/LeadDetailSlideover.vue', 'utf8')
const portalInboxSource = readFileSync('app/components/portal/LeadsInbox.vue', 'utf8')
const portalListApiSource = readFileSync('server/api/client-portal/leads/list.get.ts', 'utf8')
const portalDetailApiSource = readFileSync('server/api/client-portal/leads/[id].get.ts', 'utf8')
const portalExportApiSource = readFileSync('server/api/client-portal/leads/export.get.ts', 'utf8')
const agencyListApiSource = readFileSync('server/api/leads/list.get.ts', 'utf8')
const ruleCreateApiSource = readFileSync('server/api/leads/rules/index.post.ts', 'utf8')

const endpoint: SafeEmailLeadEndpoint = {
  id: '33333333-3333-4333-8333-333333333333',
  client_id: '11111111-1111-4111-8111-111111111111',
  label: 'carsales',
  address_prefix: 'carsales',
  email_address: 'carsales-0123456789@leads.xeroflow.io',
  expected_provider: 'carsales',
  parser_mode: 'auto',
  ai_extraction_mode: 'disabled',
  ai_privacy_approval_version: null,
  ai_privacy_approved_at: null,
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
  oldest_nonterminal_at: null,
  non_terminal_count: 0,
  recovery_attempt_count: 0,
  exhausted_recovery_count: 0,
  recovery_state: 'idle',
  address_prefix_locked: true,
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
  it('places CRM inbound email onboarding above general email endpoints for the selected client', () => {
    expect(tabSource.indexOf('<CrmInboundEmailOnboarding')).toBeLessThan(
      tabSource.indexOf('<LeadsEmailEndpointsTable')
    )
    expect(tabSource).toContain(':client-id="selectedClient"')
    expect(tabSource).toContain('api-base="/api/crm/email-routes"')
  })

  it('adds Email addresses without replacing Inbox or Form rules', () => {
    expect(pageSource).toContain(`{ value: 'inbox', label: 'Inbox'`)
    expect(pageSource).toContain(`{ value: 'rules', label: 'Form rules'`)
    expect(pageSource).toContain(`{ value: 'email', label: 'Email addresses'`)
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
    expect(formSource).toContain('AI fallback can only be enabled by an owner or admin')
    expect(slideoverSource).toContain('Raw email is encrypted and retained for 7 days when quarantine is required.')
    expect(slideoverSource).toContain('Form ID')
    expect(formSource).toContain('Routing customisation state is not supplied by the safe endpoint API')
    expect(formSource).not.toMatch(/value:\s*['"]{2}/)
  })

  it('keeps the approved fallback value visible while always leaving the Off choice selectable', () => {
    expect(policySource).toContain(`{ value: 'fallback', label: 'Platform-gated fallback', disabled: true }`)
    expect(policySource).not.toContain(`:disabled="endpoint?.ai_extraction_mode === 'fallback'"`)
    expect(policySource).toContain('Turning fallback off revokes its recorded privacy approval')
  })

  it('uses local Lucide icons and exposes all table states and agency actions', () => {
    const iconValues = [...`${pageSource}\n${tableFeatureSource}\n${formSource}\n${confirmationFeatureSource}\n${badgeSource}`.matchAll(/\bi-[a-z0-9-]+/g)]
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
    expect(tableFeatureSource).not.toContain('Not supplied by endpoint list API')
    expect(tableFeatureSource).toContain('Oldest pending')
    expect(tableFeatureSource).toContain('recovery_attempt_count')
    expect(tableFeatureSource).toContain('exhausted_recovery_count')
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

describe('email source integration contracts', () => {
  it('supports creating and filtering email form rules without remote icons', () => {
    expect(rulesSource).toContain(`{ value: 'email', label: 'Inbound email'`)
    expect(ruleCreateApiSource).toMatch(/z\.enum\(\[[^\]]*'email'/)
    expect(filtersSource).toContain(`{ value: 'email', label: 'Email' }`)
    expect(agencyListApiSource).toMatch(/z\.enum\(\[[^\]]*'email'/)
    expect(sourceIconSource).toContain(`email: 'i-lucide-mail'`)
    expect(sourceIconSource).not.toMatch(/https?:\/\//)
  })

  it('renders only safe email metadata and an advisory duplicate action', () => {
    for (const source of [leadDetailSource, portalInboxSource]) {
      expect(source).toContain('email_provider')
      expect(source).toContain('email_endpoint_label')
      expect(source).toContain('possible_duplicate_lead_id')
      expect(source).not.toMatch(/recipient_token|address_token|sender_domain|r2_|identity_hash|message_id_hash|safe_evidence/)
    }
    expect(leadDetailSource).toContain('Possible duplicate')
    expect(pageSource).toContain(':lead-id="routedLeadId"')
    expect(portalInboxSource).toContain('View possible duplicate')
  })

  it('allows email portal filtering and rechecks candidate portal visibility', () => {
    expect(portalListApiSource).toContain(`'email'`)
    expect(portalExportApiSource).toContain(`'email'`)
    for (const source of [portalListApiSource, portalDetailApiSource]) {
      expect(source).toContain('duplicate_lead.client_id')
      expect(source).toContain('duplicate_destination.destination_type')
      expect(source).toContain(`'portal'`)
    }
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
    expect(classifyEmailEndpointHealth({
      ...endpoint,
      last_received_at: null,
      created_at: '2026-07-29T09:30:00.000Z'
    }, now)).toMatchObject({
      label: 'Awaiting first message',
      color: 'info',
      description: 'Waiting for the first message within the expected 24-hour window.'
    })
    expect(classifyEmailEndpointHealth({ ...endpoint, last_received_at: null }, now))
      .toMatchObject({
        label: 'Overdue',
        color: 'warning',
        description: 'No message within the expected 24-hour window.'
      })
    expect(classifyEmailEndpointHealth({ ...endpoint, expected_max_silence_hours: null }, now))
      .toMatchObject({ label: 'Active', color: 'info' })
  })
})

describe('email endpoint recovery overview', () => {
  it('distinguishes clear, pending, retrying, and exhausted endpoint recovery states', () => {
    expect(classifyEmailEndpointRecovery(endpoint))
      .toMatchObject({ label: 'Clear', color: 'neutral' })
    expect(classifyEmailEndpointRecovery({
      ...endpoint,
      recovery_state: 'pending',
      non_terminal_count: 1,
      oldest_nonterminal_at: '2026-07-29T08:00:00.000Z'
    })).toMatchObject({ label: 'Pending', color: 'info' })
    expect(classifyEmailEndpointRecovery({
      ...endpoint,
      recovery_state: 'retrying',
      non_terminal_count: 2,
      recovery_attempt_count: 3,
      oldest_nonterminal_at: '2026-07-29T08:00:00.000Z'
    })).toMatchObject({
      label: 'Recovering',
      color: 'warning',
      description: '2 messages pending; highest attempt 3.'
    })
    expect(classifyEmailEndpointRecovery({
      ...endpoint,
      recovery_state: 'exhausted',
      exhausted_recovery_count: 2
    })).toMatchObject({
      label: 'Exhausted',
      color: 'error',
      description: '2 messages exhausted automatic recovery.'
    })
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
  app.component('CrmInboundEmailOnboarding', { template: '<div data-crm-inbound-email />' })
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
    if (request === '/api/agency/team-members') return { members: [] }
    if (request === '/api/leads/email-endpoints') {
      return {
        items,
        clients: [{ id: endpoint.client_id, name: 'Northside Motors' }]
      }
    }
    throw new Error(`Unexpected request: ${request}`)
  })
}

describe('email endpoint component DOM smoke', () => {
  it('loads only agency-safe client-scoped list data and renders without console errors', async () => {
    const fetchMock = endpointFetch([endpoint])
    const mounted = mountEmailEndpoints(fetchMock)
    expect(mounted.host.querySelectorAll('[data-skeleton]')).toHaveLength(6)
    await mounted.flush()
    expect(fetchMock).toHaveBeenCalledWith('/api/leads/email-endpoints', { method: 'GET' })
    expect(fetchMock).not.toHaveBeenCalledWith('/api/agency/clients')
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
  const toastAdd = vi.fn()
  Object.assign(globalThis, {
    $fetch: fetchMock,
    useToast: () => ({ add: toastAdd })
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
    toastAdd,
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
    const firstBatch = deferred<{
      items: SafeEmailLeadEndpoint[]
      clients: Array<{ id: string, name: string }>
    }>()
    const firstTeam = deferred<{ members: Array<{ id: string, name: string }> }>()
    let batchCalls = 0
    let teamCalls = 0
    const fetchMock = vi.fn((request: string) => {
      if (request === '/api/agency/team-members') {
        teamCalls += 1
        return teamCalls === 1
          ? firstTeam.promise
          : Promise.resolve({ members: [{ id: 'new-user', name: 'New user' }] })
      }
      if (request === '/api/leads/email-endpoints') {
        batchCalls += 1
        return batchCalls === 1
          ? firstBatch.promise
          : Promise.resolve({
              items: [newerEndpoint],
              clients: [{ id: newerEndpoint.client_id, name: 'New client' }]
            })
      }
      throw new Error(`Unexpected request: ${request}`)
    })
    const mounted = mountEmailEndpointsManager(fetchMock)
    const secondRefresh = mounted.manager.refresh()
    await secondRefresh
    firstBatch.resolve({
      items: [endpoint],
      clients: [{ id: endpoint.client_id, name: 'Old client' }]
    })
    firstTeam.resolve({ members: [{ id: 'old-user', name: 'Old user' }] })
    await flushPromises()

    expect(mounted.manager.clients.value).toEqual([{ id: newerEndpoint.client_id, name: 'New client' }])
    expect(mounted.manager.team.value).toEqual([{ id: 'new-user', name: 'New user' }])
    expect(mounted.manager.filteredEndpoints.value).toEqual([newerEndpoint])
    mounted.cleanup()
  })

  it('ignores an old 403 that arrives after a newer success', async () => {
    const firstBatch = deferred<{
      items: SafeEmailLeadEndpoint[]
      clients: Array<{ id: string, name: string }>
    }>()
    let batchCalls = 0
    const fetchMock = vi.fn((request: string) => {
      if (request === '/api/agency/team-members') return Promise.resolve({ members: [] })
      if (request === '/api/leads/email-endpoints') {
        batchCalls += 1
        return batchCalls === 1
          ? firstBatch.promise
          : Promise.resolve({
              items: [newerEndpoint],
              clients: [{ id: newerEndpoint.client_id, name: 'New client' }]
            })
      }
      throw new Error(`Unexpected request: ${request}`)
    })
    const mounted = mountEmailEndpointsManager(fetchMock)
    await mounted.manager.refresh()
    firstBatch.reject({ statusCode: 403 })
    await flushPromises()

    expect(mounted.manager.forbidden.value).toBe(false)
    expect(mounted.manager.loadError.value).toBeNull()
    expect(mounted.manager.filteredEndpoints.value).toEqual([newerEndpoint])
    mounted.cleanup()
  })

  it('keeps a newer error when an old success resolves afterwards', async () => {
    const firstBatch = deferred<{
      items: SafeEmailLeadEndpoint[]
      clients: Array<{ id: string, name: string }>
    }>()
    const firstTeam = deferred<{ members: Array<{ id: string, name: string }> }>()
    let batchCalls = 0
    let teamCalls = 0
    const fetchMock = vi.fn((request: string) => {
      if (request === '/api/agency/team-members') {
        teamCalls += 1
        return teamCalls === 1 ? firstTeam.promise : Promise.resolve({ members: [] })
      }
      if (request === '/api/leads/email-endpoints') {
        batchCalls += 1
        return batchCalls === 1
          ? firstBatch.promise
          : Promise.reject(new Error('new request failed'))
      }
      throw new Error(`Unexpected request: ${request}`)
    })
    const mounted = mountEmailEndpointsManager(fetchMock)
    await mounted.manager.refresh()
    firstBatch.resolve({
      items: [endpoint],
      clients: [{ id: endpoint.client_id, name: 'Old client' }]
    })
    firstTeam.resolve({ members: [{ id: 'old-user', name: 'Old user' }] })
    await flushPromises()

    expect(mounted.manager.loadError.value).toBe('new request failed')
    expect(mounted.manager.clients.value).toEqual([])
    expect(mounted.manager.team.value).toEqual([])
    expect(mounted.manager.filteredEndpoints.value).toEqual([])
    mounted.cleanup()
  })

  it('keeps pending tied to the current request when an older request finishes first', async () => {
    const firstBatch = deferred<{
      items: SafeEmailLeadEndpoint[]
      clients: Array<{ id: string, name: string }>
    }>()
    const secondBatch = deferred<{
      items: SafeEmailLeadEndpoint[]
      clients: Array<{ id: string, name: string }>
    }>()
    let batchCalls = 0
    const fetchMock = vi.fn((request: string) => {
      if (request === '/api/agency/team-members') return Promise.resolve({ members: [] })
      if (request === '/api/leads/email-endpoints') {
        batchCalls += 1
        return batchCalls === 1 ? firstBatch.promise : secondBatch.promise
      }
      throw new Error(`Unexpected request: ${request}`)
    })
    const mounted = mountEmailEndpointsManager(fetchMock)
    const secondRefresh = mounted.manager.refresh()
    firstBatch.resolve({
      items: [endpoint],
      clients: [{ id: endpoint.client_id, name: 'Old client' }]
    })
    await flushPromises()
    expect(mounted.manager.pending.value).toBe(true)

    secondBatch.resolve({
      items: [newerEndpoint],
      clients: [{ id: newerEndpoint.client_id, name: 'New client' }]
    })
    await secondRefresh
    expect(mounted.manager.pending.value).toBe(false)
    mounted.cleanup()
  })

  it('keeps the last successful scoped batch visible when a refresh fails transiently', async () => {
    let batchCalls = 0
    const fetchMock = vi.fn((request: string) => {
      if (request === '/api/agency/team-members') return Promise.resolve({ members: [] })
      if (request === '/api/leads/email-endpoints') {
        batchCalls += 1
        return batchCalls === 1
          ? Promise.resolve({
              items: [endpoint],
              clients: [{ id: endpoint.client_id, name: 'Northside Motors' }]
            })
          : Promise.reject(new Error('temporary endpoint read failure'))
      }
      throw new Error(`Unexpected request: ${request}`)
    })
    const mounted = mountEmailEndpointsManager(fetchMock)
    await flushPromises()
    await mounted.manager.refresh()

    expect(mounted.manager.filteredEndpoints.value).toEqual([endpoint])
    expect(mounted.manager.loadError.value).toBe('temporary endpoint read failure')
    mounted.cleanup()
  })

  it('keeps a successful scoped batch when ancillary team options fail', async () => {
    const fetchMock = vi.fn((request: string) => {
      if (request === '/api/agency/team-members') {
        return Promise.reject(new Error('temporary team read failure'))
      }
      if (request === '/api/leads/email-endpoints') {
        return Promise.resolve({
          items: [endpoint],
          clients: [{ id: endpoint.client_id, name: 'Northside Motors' }]
        })
      }
      throw new Error(`Unexpected request: ${request}`)
    })
    const mounted = mountEmailEndpointsManager(fetchMock)
    await flushPromises()

    expect(mounted.manager.filteredEndpoints.value).toEqual([endpoint])
    expect(mounted.manager.clients.value).toEqual([
      { id: endpoint.client_id, name: 'Northside Motors' }
    ])
    expect(mounted.manager.forbidden.value).toBe(false)
    expect(mounted.manager.loadError.value).toBeNull()
    expect(mounted.toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Team options unavailable',
      color: 'warning'
    }))
    mounted.cleanup()
  })
})
