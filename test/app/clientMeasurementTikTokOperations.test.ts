// @vitest-environment happy-dom
import { createApp, h, nextTick, type App, type Component } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ClientMeasurementDestinationEditor from '~~/app/components/clients/ClientMeasurementDestinationEditor.vue'
import ClientMeasurementProviderTest from '~~/app/components/clients/ClientMeasurementProviderTest.vue'

const nuxtUiFormStubs = {
  UFormField: {
    props: ['label', 'help', 'error'],
    template: '<label><span>{{ label }}</span><slot /><small>{{ error || help }}</small></label>'
  },
  USelectMenu: {
    inheritAttrs: false,
    props: ['modelValue', 'items', 'valueKey', 'labelKey', 'disabled', 'placeholder'],
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-if="placeholder" disabled value="">{{ placeholder }}</option><option v-for="item in items" :key="typeof item === \'object\' ? item[valueKey || \'value\'] : item" :value="typeof item === \'object\' ? item[valueKey || \'value\'] : item">{{ typeof item === \'object\' ? item[labelKey || \'label\'] : item }}</option></select>'
  },
  USelect: {
    inheritAttrs: false,
    props: ['modelValue', 'items', 'valueKey', 'labelKey', 'disabled', 'placeholder'],
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-if="placeholder" disabled value="">{{ placeholder }}</option><option v-for="item in items" :key="typeof item === \'object\' ? item[valueKey || \'value\'] : item" :value="typeof item === \'object\' ? item[valueKey || \'value\'] : item">{{ typeof item === \'object\' ? item[labelKey || \'label\'] : item }}</option></select>'
  },
  UInput: {
    inheritAttrs: false,
    props: ['modelValue', 'type', 'disabled'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" :type="type || \'text\'" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)">'
  },
  UTextarea: {
    inheritAttrs: false,
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<textarea v-bind="$attrs" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UCheckbox: {
    inheritAttrs: false,
    props: ['modelValue', 'label', 'description', 'disabled'],
    emits: ['update:modelValue'],
    template: '<label><input v-bind="$attrs" type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)"><span>{{ label }}</span><small>{{ description }}</small></label>'
  },
  UButton: {
    inheritAttrs: false,
    props: ['disabled', 'loading', 'label'],
    emits: ['click'],
    template: '<button v-bind="$attrs" type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>'
  },
  UIcon: {
    props: ['name'],
    template: '<i :data-icon="name" />'
  }
} satisfies Record<string, Component>

function registerNuxtUiFormStubs(app: App) {
  Object.entries(nuxtUiFormStubs).forEach(([name, component]) => app.component(name, component))
}

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

async function flushUi() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function select(element: HTMLSelectElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function check(element: HTMLInputElement) {
  element.checked = true
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('TikTok measurement operations', () => {
  it('creates a dormant TikTok Pixel and Events API destination from a secret reference', async () => {
    const fetchMock = vi.fn(async (request: string, options?: { method?: string }) => {
      if (request === '/api/agency/social/meta/accounts') return []
      if (request.endsWith('/destinations') && options?.method === 'POST') {
        return {
          destination: { id: '22222222-2222-4222-8222-222222222222' },
          profileConfigVersion: 5,
          warnings: []
        }
      }
      throw new Error(`Unexpected request: ${request}`)
    })
    Object.assign(globalThis, { $fetch: fetchMock })

    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementDestinationEditor, {
        clientId: CLIENT_ID,
        profileConfigVersion: 4
      })
    })
    registerNuxtUiFormStubs(app)
    app.mount(host)
    await flushUi()

    try {
      select(host.querySelector<HTMLSelectElement>('[data-testid="measurement-platform"]')!, 'tiktok')
      await flushUi()

      expect(host.textContent).toContain('TikTok Pixel')
      expect(host.textContent).toContain('TikTok Events API')
      expect(host.textContent).toContain('Vehicle view')
      expect(host.querySelector('[data-testid="measurement-connection"]')).toBeNull()

      const credentialInput = host.querySelector<HTMLInputElement>('[data-testid="measurement-credential-ref"]')!
      input(credentialInput, 'not-a-secret-binding')
      input(host.querySelector<HTMLInputElement>('[data-testid="measurement-destination-id"]')!, 'CABC1234567890')
      check(host.querySelector<HTMLInputElement>('[data-testid="capability-tiktok_pixel"]')!)
      check(host.querySelector<HTMLInputElement>('[data-testid="capability-tiktok_events_api"]')!)
      check(host.querySelector<HTMLInputElement>('[data-testid="mapping-lead_created"]')!)
      await nextTick()
      input(host.querySelector<HTMLInputElement>('[data-testid="provider-event-lead_created"]')!, 'Lead')
      input(host.querySelector<HTMLTextAreaElement>('[data-testid="measurement-destination-reason"]')!, 'Configure the approved Werribee TikTok test destination')
      await nextTick()

      const save = host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-destination"]')!
      expect(save.disabled).toBe(true)
      input(credentialInput, 'MEASUREMENT_PROVIDER_TIKTOK_WERRIBEE')
      await nextTick()
      expect(save.disabled).toBe(false)
      save.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(`/api/agency/measurement/clients/${CLIENT_ID}/destinations`, {
        method: 'POST',
        body: expect.objectContaining({
          destination: expect.objectContaining({
            platform: 'tiktok',
            socialConnectionId: null,
            credentialRef: 'MEASUREMENT_PROVIDER_TIKTOK_WERRIBEE',
            externalDestinationId: 'CABC1234567890',
            capabilities: expect.arrayContaining([
              expect.objectContaining({ mode: 'tiktok_pixel', managementOrigin: 'gtm', canZeroMutate: false }),
              expect.objectContaining({ mode: 'tiktok_events_api', managementOrigin: 'zero', canZeroMutate: true })
            ]),
            mappings: [expect.objectContaining({ canonicalEventName: 'lead_created', providerEventName: 'Lead' })]
          })
        })
      })
    } finally {
      app.unmount()
    }
  })

  it('sends one TikTok Test Events request with ephemeral browser context', async () => {
    const fetchMock = vi.fn(async () => ({
      run: {
        id: '33333333-3333-4333-8333-333333333333',
        mode: 'tiktok_test_events',
        status: 'accepted',
        providerRequestId: 'tiktok-request-safe-1',
        errorClass: null,
        redactedError: null,
        completedAt: '2026-09-04T06:00:00.000Z'
      }
    }))
    Object.assign(globalThis, { $fetch: fetchMock })

    const destination = {
      id: '22222222-2222-4222-8222-222222222222',
      platform: 'tiktok' as const,
      capabilities: [{
        id: '44444444-4444-4444-8444-444444444444',
        mode: 'tiktok_events_api' as const,
        status: 'configured' as const,
        managementOrigin: 'zero' as const,
        canZeroMutate: true,
        evidenceAt: null,
        blockingReason: null
      }],
      mappings: [{
        id: '55555555-5555-4555-8555-555555555555',
        canonicalEventName: 'lead_created' as const,
        providerEventName: 'Lead',
        isActive: true
      }]
    }
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProviderTest, {
        clientId: CLIENT_ID,
        profileConfigVersion: 4,
        destination
      })
    })
    registerNuxtUiFormStubs(app)
    app.mount(host)

    try {
      expect(host.textContent).toContain('TikTok Test Events')
      input(host.querySelector<HTMLInputElement>('[data-testid="provider-test-code"]')!, 'TEST-WERRIBEE')
      input(host.querySelector<HTMLInputElement>('[data-testid="provider-test-browser-event-id"]')!, 'browser-event-werribee-1')
      input(host.querySelector<HTMLInputElement>('[data-testid="provider-test-ttclid"]')!, 'approved-test-click')
      const sourceUrl = host.querySelector<HTMLInputElement>('[data-testid="provider-test-source-url"]')!
      input(sourceUrl, 'https://rebtyota.com.au/enquire?token=must-not-pass')
      input(host.querySelector<HTMLInputElement>('[data-testid="provider-test-user-agent"]')!, 'Approved Werribee Test Browser')
      input(host.querySelector<HTMLTextAreaElement>('[data-testid="provider-test-reason"]')!, 'Approved controlled Werribee TikTok test')
      check(host.querySelector<HTMLInputElement>('[data-testid="provider-test-confirmed"]')!)
      await nextTick()

      const run = host.querySelector<HTMLButtonElement>('[data-testid="run-provider-test"]')!
      expect(run.disabled).toBe(true)
      expect(host.textContent).toContain('Enter a clean HTTP or HTTPS URL without query parameters.')
      input(sourceUrl, 'https://rebtyota.com.au/enquire')
      check(host.querySelector<HTMLInputElement>('[data-testid="provider-test-confirmed"]')!)
      await nextTick()
      expect(run.disabled).toBe(false)
      run.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(
        `/api/agency/measurement/clients/${CLIENT_ID}/destinations/${destination.id}/test`,
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            mode: 'tiktok_test_events',
            testEventCode: 'TEST-WERRIBEE',
            browserEventId: 'browser-event-werribee-1',
            ttclid: 'approved-test-click',
            ttp: null,
            eventSourceUrl: 'https://rebtyota.com.au/enquire',
            clientUserAgent: 'Approved Werribee Test Browser',
            confirmed: true
          })
        })
      )
      expect(host.textContent).toContain('Provider accepted the test request')
      expect(host.textContent).not.toContain('approved-test-click')
    } finally {
      app.unmount()
    }
  })
})
