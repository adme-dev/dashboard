// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
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
      capabilities: [{ mode: 'meta_crm_capi' }],
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
        profileConfigVersion: 3,
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
      capabilities: [{ mode: 'meta_crm_capi' }],
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
        profileConfigVersion: 3,
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
})
