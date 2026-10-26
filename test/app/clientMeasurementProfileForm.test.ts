// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import ClientMeasurementProfileForm from '~~/app/components/clients/ClientMeasurementProfileForm.vue'
import type { ClientMeasurementProfile } from '~~/app/types/measurement'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const profile: ClientMeasurementProfile = {
  id: '22222222-2222-4222-8222-222222222222',
  clientId: CLIENT_ID,
  desiredEnabled: false,
  desiredStateSource: 'existing_review',
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

const SITE_ID = '33333333-3333-4333-8333-333333333333'
const FOREIGN_SITE_ID = '44444444-4444-4444-8444-444444444444'
const siteLookup = {
  data: ref<{ sites: Array<{ id: string, client_id: string, name: string }> }>({ sites: [] }),
  status: ref('success'),
  error: ref<Error | null>(null),
  execute: vi.fn(),
  clear: vi.fn()
}
const useFetchMock = vi.fn(() => siteLookup)

beforeEach(() => {
  siteLookup.data.value = { sites: [{ id: SITE_ID, client_id: CLIENT_ID, name: 'Astoria website' }] }
  siteLookup.status.value = 'success'
  siteLookup.error.value = null
  useFetchMock.mockClear()
  siteLookup.execute.mockReset()
  vi.stubGlobal('useFetch', useFetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const stubs = {
  UFormField: {
    props: ['label', 'help', 'error'],
    template: '<label>{{ label }}<slot /><span>{{ help }}</span><span>{{ error }}</span></label>'
  },
  USelectMenu: {
    props: ['modelValue', 'items', 'disabled', 'loading'],
    emits: ['update:modelValue'],
    template: `<select :value="modelValue" :disabled="disabled" :data-loading="loading" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="item in items" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
    </select>`
  },
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
    const saved: Array<{ profile: ClientMeasurementProfile, warnings: Array<{ code: string }> }> = []

    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementProfileForm, {
        clientId: CLIENT_ID,
        profile,
        canConfigure: true,
        onSaved: (value: { profile: ClientMeasurementProfile, warnings: Array<{ code: string }> }) => saved.push(value)
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
      expect(saved).toEqual([{
        profile: expect.objectContaining({ consentMode: 'au_optout', configVersion: 5 }),
        warnings: []
      }])
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

function mountForm(current = profile, canConfigure = true) {
  const fetchMock = vi.fn(async (_url, options) => ({ profile: { ...current, ...options.body.patch, configVersion: 5 }, warnings: [] }))
  vi.stubGlobal('$fetch', fetchMock)
  const host = document.createElement('div')
  const app = createApp({ render: () => h(ClientMeasurementProfileForm, { clientId: CLIENT_ID, profile: current, canConfigure }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { host, fetchMock, unmount: () => app.unmount() }
}

function setReason(host: HTMLElement) {
  updateField(host.querySelector<HTMLTextAreaElement>('[data-testid="measurement-change-reason"]')!, 'Link the approved client website')
}

describe('tracking site selection', () => {
  it('requests and offers only this client sites, then saves the selected site ID', async () => {
    siteLookup.data.value.sites.push({ id: FOREIGN_SITE_ID, client_id: 'another-client', name: 'Other client website' })
    const test = mountForm()
    try {
      const [url, options] = useFetchMock.mock.calls[0] as unknown as [string, { query: { value: { clientId: string } } }]
      expect(url).toBe('/api/agency/tracking')
      expect(options.query.value).toEqual({ clientId: CLIENT_ID })
      const picker = test.host.querySelector<HTMLSelectElement>('[data-testid="measurement-tracking-site"]')!
      expect([...picker.options].map(option => option.value)).toEqual(['__none__', SITE_ID])
      expect(test.host.textContent).not.toContain('Other client website')
      updateField(picker, SITE_ID)
      setReason(test.host)
      await nextTick()
      test.host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-profile"]')!.click()
      await flushUi()
      expect(test.fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: {
        expectedVersion: 4, reason: 'Link the approved client website', patch: { trackingSiteId: SITE_ID }
      } }))
    } finally { test.unmount() }
  })

  it('preserves an existing link when lookup fails and unrelated fields are saved', async () => {
    siteLookup.status.value = 'error'
    siteLookup.error.value = new Error('Unavailable')
    const test = mountForm({ ...profile, trackingSiteId: SITE_ID })
    try {
      expect(test.host.querySelector<HTMLSelectElement>('[data-testid="measurement-tracking-site"]')!.disabled).toBe(true)
      expect(test.host.textContent).toContain('Tracking sites could not be loaded')
      updateField(test.host.querySelector<HTMLSelectElement>('[data-testid="measurement-consent-mode"]')!, 'au_optout')
      setReason(test.host)
      await nextTick()
      test.host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-profile"]')!.click()
      await flushUi()
      expect(test.fetchMock.mock.calls[0][1].body.patch).toEqual({ consentMode: 'au_optout' })
      test.host.querySelector<HTMLButtonElement>('[data-testid="retry-tracking-sites"]')!.click()
      expect(siteLookup.execute).toHaveBeenCalled()
    } finally { test.unmount() }
  })

  it('clears an existing link only through an explicit no-site selection', async () => {
    const test = mountForm({ ...profile, trackingSiteId: SITE_ID })
    try {
      setReason(test.host)
      await nextTick()
      const save = test.host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-profile"]')!
      expect(save.disabled).toBe(true)
      updateField(test.host.querySelector<HTMLSelectElement>('[data-testid="measurement-tracking-site"]')!, '__none__')
      await nextTick()
      save.click()
      await flushUi()
      expect(test.fetchMock.mock.calls[0][1].body.patch).toEqual({ trackingSiteId: null })
    } finally { test.unmount() }
  })

  it('blocks changes while loading and rejects values outside the client site list', async () => {
    siteLookup.status.value = 'pending'
    const test = mountForm()
    try {
      const picker = test.host.querySelector<HTMLSelectElement>('[data-testid="measurement-tracking-site"]')!
      expect(picker.disabled).toBe(true)
      expect(test.host.textContent).toContain('Loading tracking sites')
      siteLookup.status.value = 'success'
      await nextTick()
      // A synthetic DOM option must not bypass validation of the fetched client sites.
      const foreignOption = document.createElement('option')
      foreignOption.value = FOREIGN_SITE_ID
      foreignOption.textContent = 'Foreign site'
      picker.add(foreignOption)
      updateField(picker, FOREIGN_SITE_ID)
      setReason(test.host)
      await nextTick()
      const save = test.host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-profile"]')!
      expect(save.disabled).toBe(true)
      expect(test.host.textContent).toContain('Choose a tracking site belonging to this client')
      save.click()
      expect(test.fetchMock).not.toHaveBeenCalled()
    } finally { test.unmount() }
  })

  it('does not fetch site choices for read-only operators', () => {
    const test = mountForm(profile, false)
    try {
      expect((useFetchMock.mock.calls[0] as unknown as [string, { immediate: boolean }])[1].immediate).toBe(false)
      expect(test.host.querySelector('[data-testid="measurement-tracking-site"]')).toBeNull()
    } finally { test.unmount() }
  })
})

it('keeps a missing existing site linked until explicitly changed', async () => {
  siteLookup.data.value = { sites: [] }
  const test = mountForm({ ...profile, trackingSiteId: SITE_ID })
  try {
    const picker = test.host.querySelector<HTMLSelectElement>('[data-testid="measurement-tracking-site"]')!
    expect(picker.value).toBe(SITE_ID)
    expect(picker.selectedOptions[0].textContent).toContain('Current linked site')
    expect(test.host.textContent).toContain('No tracking sites are available for this client')
    updateField(test.host.querySelector<HTMLSelectElement>('[data-testid="measurement-consent-mode"]')!, 'au_optout')
    setReason(test.host)
    await nextTick()
    test.host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-profile"]')!.click()
    await flushUi()
    expect(test.fetchMock.mock.calls[0][1].body.patch).toEqual({ consentMode: 'au_optout' })
  } finally { test.unmount() }
})

it('does not allow unlinking a site required by first-party collection', async () => {
  const test = mountForm({ ...profile, trackingSiteId: SITE_ID, collectionTier: 'first_party_cname', firstPartyHostname: 'measure.example.com', hostnameStatus: 'active' })
  try {
    updateField(test.host.querySelector<HTMLSelectElement>('[data-testid="measurement-tracking-site"]')!, '__none__')
    setReason(test.host)
    await nextTick()
    expect(test.host.textContent).toContain('First-party collection requires a linked tracking site')
    expect(test.host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-profile"]')!.disabled).toBe(true)
  } finally { test.unmount() }
})

it('discards old client choices and unsaved selection when the active client changes', async () => {
  const active = ref({ clientId: CLIENT_ID, profile })
  const fetchMock = vi.fn()
  vi.stubGlobal('$fetch', fetchMock)
  const host = document.createElement('div')
  const app = createApp({ render: () => h(ClientMeasurementProfileForm, { ...active.value, canConfigure: true }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  try {
    updateField(host.querySelector<HTMLSelectElement>('[data-testid="measurement-tracking-site"]')!, SITE_ID)
    setReason(host)
    await nextTick()
    active.value = { clientId: 'another-client', profile: { ...profile, clientId: 'another-client' } }
    await flushUi()
    const picker = host.querySelector<HTMLSelectElement>('[data-testid="measurement-tracking-site"]')!
    expect([...picker.options].map(option => option.value)).toEqual(['__none__'])
    expect(picker.value).toBe('__none__')
    expect((useFetchMock.mock.calls[0] as unknown as [string, { query: { value: unknown } }])[1].query.value).toEqual({ clientId: 'another-client' })
    expect(siteLookup.execute).toHaveBeenCalled()
    expect(host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-profile"]')!.disabled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  } finally { app.unmount() }
})
