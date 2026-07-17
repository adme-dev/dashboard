// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import ClientMeasurementProfileForm from '~~/app/components/clients/ClientMeasurementProfileForm.vue'
import type { ClientMeasurementProfile } from '~~/app/types/measurement'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const profile: ClientMeasurementProfile = {
  id: '22222222-2222-4222-8222-222222222222',
  clientId: CLIENT_ID,
  enabled: false,
  environment: 'test',
  collectionTier: 'backend_only',
  trackingSiteId: null,
  firstPartyHostname: null,
  hostnameStatus: 'not_required',
  consentMode: 'consent_gated',
  vertical: 'automotive',
  outcomeAuthority: 'zero_native',
  nativeLifecycleMode: 'crm_preferred',
  portalOutcomeMode: 'disabled',
  configVersion: 4,
  cacheStatus: 'fresh',
  cacheVersion: 4,
  cacheErrorClass: null,
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T01:00:00.000Z'
}

const stubs = {
  UButton: {
    props: ['disabled', 'loading', 'label'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>'
  },
  UIcon: {
    props: ['name'],
    template: '<i :data-icon="name" />'
  }
}

async function flushUi() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function updateField(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

describe('ClientMeasurementProfileForm', () => {
  it('sends only changed dormant profile fields with version and audit reason', async () => {
    const fetchMock = vi.fn(async () => ({
      profile: { ...profile, consentMode: 'au_optout', configVersion: 5 },
      warnings: []
    }))
    Object.assign(globalThis, { $fetch: fetchMock })
    const saved: ClientMeasurementProfile[] = []

    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProfileForm, {
        clientId: CLIENT_ID,
        profile,
        canConfigure: true,
        onSaved: (value: ClientMeasurementProfile) => saved.push(value)
      })
    })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)

    try {
      expect(host.textContent).toContain('Edit configuration')
      expect(host.textContent).toContain('Activation is managed separately')
      expect(host.textContent).not.toContain('Enable live delivery')

      const save = host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-profile"]')!
      expect(save.disabled).toBe(true)

      updateField(host.querySelector<HTMLSelectElement>('[data-testid="measurement-consent-mode"]')!, 'au_optout')
      updateField(host.querySelector<HTMLTextAreaElement>('[data-testid="measurement-change-reason"]')!, 'Align consent handling with the approved Australian opt-out policy')
      await nextTick()
      expect(save.disabled).toBe(false)

      save.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(`/api/agency/measurement/clients/${CLIENT_ID}/profile`, {
        method: 'PUT',
        body: {
          expectedVersion: 4,
          reason: 'Align consent handling with the approved Australian opt-out policy',
          patch: { consentMode: 'au_optout' }
        }
      })
      expect(saved).toEqual([expect.objectContaining({ consentMode: 'au_optout', configVersion: 5 })])
      expect(host.textContent).not.toContain('cloudflare/measurement')
    } finally {
      app.unmount()
    }
  })

  it('keeps profile configuration read-only when the operator cannot write', () => {
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProfileForm, {
        clientId: CLIENT_ID,
        profile,
        canConfigure: false
      })
    })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)

    try {
      expect(host.textContent).toContain('Read-only access')
      expect(host.querySelector('[data-testid="save-measurement-profile"]')).toBeNull()
      expect(host.querySelector('select')).toBeNull()
      expect(host.querySelector('textarea')).toBeNull()
    } finally {
      app.unmount()
    }
  })
})
