// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import ClientMeasurementProviderTest from '~~/app/components/clients/ClientMeasurementProviderTest.vue'

async function flushUi() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function runnableCapability(mode: string) {
  return {
    id: crypto.randomUUID(),
    mode,
    status: 'configured' as const,
    managementOrigin: 'zero' as const,
    canZeroMutate: true,
    evidenceAt: null,
    blockingReason: null
  }
}

function registerFormStubs(app: ReturnType<typeof createApp>) {
  app.component('UButton', {
    props: ['disabled', 'loading', 'label'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>'
  })
  app.component('UFormField', {
    props: ['label', 'help', 'error', 'required'],
    template: `<label class="space-y-1.5 text-sm">
      <span>{{ label }}</span>
      <slot />
      <span v-if="error" role="alert">{{ error }}</span>
      <span v-else-if="help">{{ help }}</span>
    </label>`
  })
  app.component('UInput', {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">'
  })
  app.component('UAlert', {
    props: ['title', 'description', 'color', 'icon'],
    template: '<div role="status" :data-color="color">{{ title }} — {{ description }}</div>'
  })
}

function ga4Destination() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    platform: 'ga4' as const,
    capabilities: [runnableCapability('ga4_measurement_protocol')],
    mappings: [{
      id: '77777777-7777-4777-8777-777777777777',
      canonicalEventName: 'lead_qualified',
      providerEventName: 'qualified_lead',
      isActive: true
    }]
  }
}

async function mountWithValidationResult(validation: {
  recorded: boolean
  skippedReason: string | null
  healthStatus: string | null
}) {
  const fetchMock = vi.fn(async () => ({
    run: {
      id: '33333333-3333-4333-8333-333333333333',
      mode: 'meta_test_events',
      status: 'accepted',
      providerRequestId: 'trace-1',
      errorClass: null,
      redactedError: null,
      completedAt: '2026-07-17T08:00:01.000Z'
    },
    validation
  }))
  Object.assign(globalThis, { $fetch: fetchMock })
  const destination = {
    id: '22222222-2222-4222-8222-222222222222',
    platform: 'meta' as const,
    capabilities: [runnableCapability('meta_crm_capi')],
    mappings: [{
      id: '77777777-7777-4777-8777-777777777777',
      canonicalEventName: 'lead_qualified',
      providerEventName: 'QualifiedLead',
      isActive: true
    }]
  }
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(ClientMeasurementProviderTest, {
      clientId: '11111111-1111-4111-8111-111111111111',
      destinationConfigVersion: 3,
      destination
    })
  })
  registerFormStubs(app)
  app.mount(host)

  input(host.querySelector('[data-testid="provider-test-code"]')!, 'TEST123456')
  input(host.querySelector('[data-testid="provider-test-meta-lead-id"]')!, '1234567890123456')
  input(host.querySelector('[data-testid="provider-test-reason"]')!, 'Approved controlled pilot test')
  const confirmation = host.querySelector<HTMLInputElement>('[data-testid="provider-test-confirmed"]')!
  confirmation.checked = true
  confirmation.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()

  host.querySelector<HTMLButtonElement>('[data-testid="run-provider-test"]')!.click()
  await flushUi()

  return { host, app }
}

describe('ClientMeasurementProviderTest', () => {
  it('requires explicit confirmation and sends transient Meta evidence without retaining it in the result', async () => {
    const fetchMock = vi.fn(async () => ({
      run: {
        id: '33333333-3333-4333-8333-333333333333',
        mode: 'meta_test_events',
        status: 'accepted',
        providerRequestId: 'trace-1',
        errorClass: null,
        redactedError: null,
        completedAt: '2026-07-17T08:00:01.000Z'
      }
    }))
    Object.assign(globalThis, { $fetch: fetchMock })

    const destination = {
      id: '22222222-2222-4222-8222-222222222222',
      platform: 'meta' as const,
      capabilities: [runnableCapability('meta_crm_capi')],
      mappings: [{
        id: '77777777-7777-4777-8777-777777777777',
        canonicalEventName: 'lead_qualified',
        providerEventName: 'QualifiedLead',
        isActive: true
      }]
    }
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProviderTest, {
        clientId: '11111111-1111-4111-8111-111111111111',
        destinationConfigVersion: 3,
        destination
      })
    })
    app.component('UButton', {
      props: ['disabled', 'loading', 'label'],
      emits: ['click'],
      template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>'
    })
    app.mount(host)

    try {
      input(host.querySelector('[data-testid="provider-test-code"]')!, 'TEST123456')
      const leadIdInput = host.querySelector<HTMLInputElement>('[data-testid="provider-test-meta-lead-id"]')!
      expect(leadIdInput.hasAttribute('maxlength')).toBe(false)
      expect(host.querySelector('[data-testid="provider-test-meta-lead-id-help"]')?.textContent)
        .toContain('exactly 15 or 16 digits')
      input(leadIdInput, '1234567890123456')
      expect(leadIdInput.getAttribute('aria-invalid')).toBe('false')
      expect(host.querySelector('[data-testid="provider-test-browser-event-id"]')).toBeNull()
      expect(host.textContent).toContain('Server-only lifecycle event')
      input(host.querySelector('[data-testid="provider-test-reason"]')!, 'Approved controlled pilot test')
      const confirmation = host.querySelector<HTMLInputElement>('[data-testid="provider-test-confirmed"]')!
      confirmation.checked = true
      confirmation.dispatchEvent(new Event('change', { bubbles: true }))
      await nextTick()

      host.querySelector<HTMLButtonElement>('[data-testid="run-provider-test"]')!.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/agency/measurement/clients/11111111-1111-4111-8111-111111111111/destinations/22222222-2222-4222-8222-222222222222/test',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            mode: 'meta_test_events',
            deliveryMode: 'crm',
            expectedConfigVersion: 3,
            canonicalEventName: 'lead_qualified',
            testEventCode: 'TEST123456',
            metaLeadId: '1234567890123456',
            browserEventId: null,
            confirmed: true,
            reason: 'Approved controlled pilot test'
          })
        })
      )
      expect(host.textContent).toContain('Provider accepted the test request')
      expect(host.textContent).not.toContain('TEST123456')
      expect(host.textContent).not.toContain('1234567890123456')
    } finally {
      app.unmount()
    }
  })

  it('shows an invalid state and prevents traffic for an overlong Meta lead ID', async () => {
    const fetchMock = vi.fn()
    Object.assign(globalThis, { $fetch: fetchMock })
    const destination = {
      id: '22222222-2222-4222-8222-222222222222',
      platform: 'meta' as const,
      capabilities: [runnableCapability('meta_crm_capi')],
      mappings: [{
        id: '77777777-7777-4777-8777-777777777777',
        canonicalEventName: 'lead_qualified',
        providerEventName: 'QualifiedLead',
        isActive: true
      }]
    }
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProviderTest, {
        clientId: '11111111-1111-4111-8111-111111111111',
        destinationConfigVersion: 3,
        destination
      })
    })
    app.component('UButton', {
      props: ['disabled', 'loading', 'label'],
      emits: ['click'],
      template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>'
    })
    app.mount(host)

    try {
      input(host.querySelector('[data-testid="provider-test-code"]')!, 'TEST123456')
      const leadIdInput = host.querySelector<HTMLInputElement>('[data-testid="provider-test-meta-lead-id"]')!
      input(leadIdInput, '12345678901234567')
      input(host.querySelector('[data-testid="provider-test-reason"]')!, 'Approved controlled pilot test')
      const confirmation = host.querySelector<HTMLInputElement>('[data-testid="provider-test-confirmed"]')!
      confirmation.checked = true
      confirmation.dispatchEvent(new Event('change', { bubbles: true }))
      await nextTick()

      expect(leadIdInput.getAttribute('aria-invalid')).toBe('true')
      expect(host.querySelector<HTMLButtonElement>('[data-testid="run-provider-test"]')?.disabled).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      app.unmount()
    }
  })

  it('sends shared browser identity and ephemeral context for Meta Web Test Events', async () => {
    const fetchMock = vi.fn(async () => ({
      run: {
        id: '33333333-3333-4333-8333-333333333333',
        mode: 'meta_test_events',
        status: 'accepted',
        providerRequestId: 'trace-web-1',
        errorClass: null,
        redactedError: null,
        completedAt: '2026-07-17T08:00:01.000Z'
      }
    }))
    Object.assign(globalThis, { $fetch: fetchMock })
    const destination = {
      id: '22222222-2222-4222-8222-222222222222',
      platform: 'meta' as const,
      capabilities: [runnableCapability('meta_web_capi')],
      mappings: [{
        id: '77777777-7777-4777-8777-777777777777',
        canonicalEventName: 'lead_created',
        providerEventName: 'Lead',
        isActive: true
      }]
    }
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProviderTest, {
        clientId: '11111111-1111-4111-8111-111111111111',
        destinationConfigVersion: 3,
        destination
      })
    })
    app.component('UButton', {
      props: ['disabled', 'loading', 'label'],
      emits: ['click'],
      template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>'
    })
    app.mount(host)

    try {
      expect(host.querySelector('[data-testid="provider-test-meta-lead-id"]')).toBeNull()
      input(host.querySelector('[data-testid="provider-test-code"]')!, 'TEST123456')
      input(host.querySelector('[data-testid="provider-test-browser-event-id"]')!, 'browser-event-1')
      input(host.querySelector('[data-testid="provider-test-fbp"]')!, 'fb.1.1234567890123.approved-browser')
      const sourceUrlInput = host.querySelector<HTMLInputElement>('[data-testid="provider-test-source-url"]')!
      input(sourceUrlInput, 'https://www.biggaragesubaru.com.au/enquire?email=person@example.com')
      await nextTick()
      expect(sourceUrlInput.getAttribute('aria-invalid')).toBe('true')
      expect(host.querySelector('#provider-test-source-url-help')?.textContent).toContain('without credentials')
      input(sourceUrlInput, 'https://www.biggaragesubaru.com.au/enquire')
      input(host.querySelector('[data-testid="provider-test-user-agent"]')!, 'Approved Pilot Browser')
      input(host.querySelector('[data-testid="provider-test-reason"]')!, 'Approved controlled pilot web test')
      const confirmation = host.querySelector<HTMLInputElement>('[data-testid="provider-test-confirmed"]')!
      confirmation.checked = true
      confirmation.dispatchEvent(new Event('change', { bubbles: true }))
      await nextTick()

      host.querySelector<HTMLButtonElement>('[data-testid="run-provider-test"]')!.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/agency/measurement/clients/11111111-1111-4111-8111-111111111111/destinations/22222222-2222-4222-8222-222222222222/test',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            mode: 'meta_test_events',
            deliveryMode: 'web',
            canonicalEventName: 'lead_created',
            testEventCode: 'TEST123456',
            browserEventId: 'browser-event-1',
            fbc: null,
            fbp: 'fb.1.1234567890123.approved-browser',
            eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
            clientUserAgent: 'Approved Pilot Browser'
          })
        })
      )
    } finally {
      app.unmount()
    }
  })

  it('does not expose Web delivery for an externally owned capability', () => {
    const destination = {
      id: '22222222-2222-4222-8222-222222222222',
      platform: 'meta' as const,
      capabilities: [{
        ...runnableCapability('meta_web_capi'),
        status: 'not_configured' as const,
        managementOrigin: 'gtm' as const,
        canZeroMutate: false
      }],
      mappings: [{
        id: '77777777-7777-4777-8777-777777777777',
        canonicalEventName: 'lead_created',
        providerEventName: 'Lead',
        isActive: true
      }]
    }
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProviderTest, {
        clientId: '11111111-1111-4111-8111-111111111111',
        destinationConfigVersion: 3,
        destination
      })
    })
    app.component('UButton', { template: '<button type="button"><slot /></button>' })
    app.mount(host)

    try {
      expect(host.querySelector('[data-testid="provider-test-browser-event-id"]')).toBeNull()
      expect(host.querySelector('[data-testid="provider-test-meta-lead-id"]')).not.toBeNull()
    } finally {
      app.unmount()
    }
  })

  it('clears approval and transient context when the selected mapping changes', async () => {
    const destination = reactive({
      id: '22222222-2222-4222-8222-222222222222',
      platform: 'meta' as const,
      capabilities: [runnableCapability('meta_web_capi'), runnableCapability('meta_crm_capi')],
      mappings: [{
        id: '77777777-7777-4777-8777-777777777777',
        canonicalEventName: 'lead_created',
        providerEventName: 'Lead',
        isActive: true
      }, {
        id: '88888888-8888-4888-8888-888888888888',
        canonicalEventName: 'lead_qualified',
        providerEventName: 'QualifiedLead',
        isActive: true
      }]
    })
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProviderTest, {
        clientId: '11111111-1111-4111-8111-111111111111',
        destinationConfigVersion: 3,
        destination
      })
    })
    app.component('UButton', {
      props: ['disabled', 'label'],
      template: '<button type="button" :disabled="disabled">{{ label }}</button>'
    })
    app.mount(host)

    try {
      input(host.querySelector('[data-testid="provider-test-code"]')!, 'TEST123456')
      input(host.querySelector('[data-testid="provider-test-browser-event-id"]')!, 'browser-event-1')
      input(host.querySelector('[data-testid="provider-test-fbc"]')!, 'fb.1.1234567890123.approved-click')
      input(host.querySelector('[data-testid="provider-test-source-url"]')!, 'https://www.biggaragesubaru.com.au/enquire')
      input(host.querySelector('[data-testid="provider-test-reason"]')!, 'Approved controlled pilot web test')
      const confirmation = host.querySelector<HTMLInputElement>('[data-testid="provider-test-confirmed"]')!
      confirmation.checked = true
      confirmation.dispatchEvent(new Event('change', { bubbles: true }))
      await nextTick()

      input(host.querySelector('[data-testid="provider-test-reason"]')!, 'Changed approval scope')
      await nextTick()
      expect(confirmation.checked).toBe(false)
      confirmation.checked = true
      confirmation.dispatchEvent(new Event('change', { bubbles: true }))
      await nextTick()

      const mapping = host.querySelector<HTMLSelectElement>('select')!
      mapping.value = 'lead_qualified'
      mapping.dispatchEvent(new Event('change', { bubbles: true }))
      await flushUi()

      expect(host.querySelector<HTMLInputElement>('[data-testid="provider-test-confirmed"]')?.checked).toBe(false)
      expect(host.querySelector<HTMLInputElement>('[data-testid="provider-test-code"]')?.value).toBe('')
      expect(host.querySelector('[data-testid="provider-test-browser-event-id"]')).toBeNull()
      expect(host.querySelector('[data-testid="provider-test-meta-lead-id"]')).not.toBeNull()
      expect(host.querySelector<HTMLButtonElement>('[data-testid="run-provider-test"]')?.disabled).toBe(true)
    } finally {
      app.unmount()
    }
  })

  it('locks every provider-test control while external traffic is in flight', async () => {
    let resolveFetch!: (value: unknown) => void
    const fetchMock = vi.fn(() => new Promise((resolve) => {
      resolveFetch = resolve
    }))
    Object.assign(globalThis, { $fetch: fetchMock })
    const destination = {
      id: '22222222-2222-4222-8222-222222222222',
      platform: 'meta' as const,
      capabilities: [runnableCapability('meta_crm_capi')],
      mappings: [{
        id: '77777777-7777-4777-8777-777777777777',
        canonicalEventName: 'lead_qualified',
        providerEventName: 'QualifiedLead',
        isActive: true
      }]
    }
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProviderTest, {
        clientId: '11111111-1111-4111-8111-111111111111',
        destinationConfigVersion: 3,
        destination
      })
    })
    app.component('UButton', {
      props: ['disabled', 'loading', 'label'],
      emits: ['click'],
      template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>'
    })
    app.mount(host)

    try {
      input(host.querySelector('[data-testid="provider-test-code"]')!, 'TEST123456')
      input(host.querySelector('[data-testid="provider-test-meta-lead-id"]')!, '1234567890123456')
      input(host.querySelector('[data-testid="provider-test-reason"]')!, 'Approved controlled pilot test')
      const confirmation = host.querySelector<HTMLInputElement>('[data-testid="provider-test-confirmed"]')!
      confirmation.checked = true
      confirmation.dispatchEvent(new Event('change', { bubbles: true }))
      await nextTick()

      host.querySelector<HTMLButtonElement>('[data-testid="run-provider-test"]')!.click()
      await nextTick()

      expect(host.querySelector<HTMLFieldSetElement>('[data-testid="provider-test-controls"]')?.disabled).toBe(true)

      resolveFetch({
        run: {
          id: '33333333-3333-4333-8333-333333333333',
          mode: 'meta_test_events',
          status: 'accepted',
          providerRequestId: 'trace-1',
          errorClass: null,
          redactedError: null,
          completedAt: '2026-07-17T08:00:01.000Z'
        }
      })
      await flushUi()
    } finally {
      app.unmount()
    }
  })

  it('sends a GA4 debug validation request and shows the recorded health status', async () => {
    const fetchMock = vi.fn(async () => ({
      run: {
        id: '33333333-3333-4333-8333-333333333333',
        mode: 'ga4_debug_validation',
        status: 'accepted',
        providerRequestId: null,
        errorClass: null,
        redactedError: null,
        completedAt: '2026-07-17T08:00:01.000Z'
      },
      validation: { recorded: true, skippedReason: null, healthStatus: 'ready' }
    }))
    Object.assign(globalThis, { $fetch: fetchMock })
    const destination = ga4Destination()
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProviderTest, {
        clientId: '11111111-1111-4111-8111-111111111111',
        destinationConfigVersion: 3,
        destination
      })
    })
    registerFormStubs(app)
    app.mount(host)

    try {
      expect(host.textContent).toContain('GA4 debug validation')
      // GA4 must not fall into either of the other two platforms' field sets.
      expect(host.querySelector('[data-testid="provider-test-code"]')).toBeNull()
      expect(host.querySelector('[data-testid="provider-test-click-id"]')).toBeNull()
      // The Meta-only capability warning must not leak onto the GA4 branch.
      expect(host.textContent).not.toContain('Zero does not own a runnable capability')

      input(host.querySelector('[data-testid="provider-test-ga-client-id"]')!, '123456789.1234567890')
      input(host.querySelector('[data-testid="provider-test-reason"]')!, 'Approved controlled pilot test')
      const confirmation = host.querySelector<HTMLInputElement>('[data-testid="provider-test-confirmed"]')!
      confirmation.checked = true
      confirmation.dispatchEvent(new Event('change', { bubbles: true }))
      await nextTick()

      const runButton = host.querySelector<HTMLButtonElement>('[data-testid="run-provider-test"]')!
      expect(runButton.textContent?.trim()).toContain('Validate GA4 event')
      runButton.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/agency/measurement/clients/11111111-1111-4111-8111-111111111111/destinations/22222222-2222-4222-8222-222222222222/test',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            mode: 'ga4_debug_validation',
            gaClientId: '123456789.1234567890',
            expectedConfigVersion: 3,
            canonicalEventName: 'lead_qualified',
            confirmed: true
          })
        })
      )
      const body = fetchMock.mock.calls[0][1].body as Record<string, unknown>
      expect(body.clickIdentifier).toBeUndefined()
      expect(body.testEventCode).toBeUndefined()
      expect(host.textContent).toContain('Destination health updated')
      expect(host.textContent).toContain('Health status is now ready.')
    } finally {
      app.unmount()
    }
  })

  it('rejects a malformed GA4 client ID before it can be submitted', async () => {
    const fetchMock = vi.fn()
    Object.assign(globalThis, { $fetch: fetchMock })
    const destination = ga4Destination()
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProviderTest, {
        clientId: '11111111-1111-4111-8111-111111111111',
        destinationConfigVersion: 3,
        destination
      })
    })
    registerFormStubs(app)
    app.mount(host)

    try {
      input(host.querySelector('[data-testid="provider-test-ga-client-id"]')!, 'not-a-client-id')
      input(host.querySelector('[data-testid="provider-test-reason"]')!, 'Approved controlled pilot test')
      const confirmation = host.querySelector<HTMLInputElement>('[data-testid="provider-test-confirmed"]')!
      confirmation.checked = true
      confirmation.dispatchEvent(new Event('change', { bubbles: true }))
      await nextTick()

      expect(host.textContent).toContain('Must be two dot-separated numbers')
      expect(host.querySelector<HTMLButtonElement>('[data-testid="run-provider-test"]')?.disabled).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      app.unmount()
    }
  })

  it('distinguishes a version-conflict skip from a recorded success', async () => {
    const { host, app } = await mountWithValidationResult({
      recorded: false,
      skippedReason: 'version_conflict',
      healthStatus: null
    })
    try {
      expect(host.textContent).toContain('Configuration changed during the test')
      expect(host.querySelector('[role="status"][data-color="warning"]')).not.toBeNull()
      expect(host.textContent).not.toContain('Destination health updated')
    } finally {
      app.unmount()
    }
  })

  it('distinguishes an idempotent replay from a recorded success', async () => {
    const { host, app } = await mountWithValidationResult({
      recorded: false,
      skippedReason: 'already_run',
      healthStatus: null
    })
    try {
      expect(host.textContent).toContain('Replayed an earlier test')
      expect(host.querySelector('[role="status"][data-color="info"]')).not.toBeNull()
    } finally {
      app.unmount()
    }
  })

  it('distinguishes a failed health recording from a recorded success, as an error', async () => {
    const { host, app } = await mountWithValidationResult({
      recorded: false,
      skippedReason: 'record_failed',
      healthStatus: null
    })
    try {
      expect(host.textContent).toContain('Destination health could not be updated')
      expect(host.querySelector('[role="status"][data-color="error"]')).not.toBeNull()
    } finally {
      app.unmount()
    }
  })

  it('surfaces a no-covered-capabilities skip distinctly from every other outcome', async () => {
    const { host, app } = await mountWithValidationResult({
      recorded: false,
      skippedReason: 'no_covered_capabilities',
      healthStatus: null
    })
    try {
      expect(host.textContent).toContain('Nothing recordable')
      expect(host.querySelector('[role="status"][data-color="warning"]')).not.toBeNull()
    } finally {
      app.unmount()
    }
  })
})
