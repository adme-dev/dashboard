// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import ClientMeasurementActivationControls from '~~/app/components/clients/ClientMeasurementActivationControls.vue'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const profile = {
  id: '22222222-2222-4222-8222-222222222222',
  clientId: CLIENT_ID,
  desiredEnabled: true,
  desiredStateSource: 'operator' as const,
  enabled: false,
  environment: 'test' as const,
  collectionTier: 'backend_only' as const,
  trackingSiteId: null,
  firstPartyHostname: null,
  hostnameStatus: 'not_required' as const,
  consentMode: 'consent_gated' as const,
  vertical: 'automotive',
  outcomeAuthority: 'zero_native' as const,
  nativeLifecycleMode: 'crm_preferred' as const,
  portalOutcomeMode: 'disabled' as const,
  configVersion: 5,
  cacheStatus: 'fresh' as const,
  cacheVersion: 5,
  cacheErrorClass: null,
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T01:00:00.000Z'
}

function readiness(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    profileId: profile.id,
    configVersion: 5,
    status: 'onboarding' as const,
    liveEligible: false,
    profile: {
      desiredEnabled: true,
      enabled: false,
      environment: 'test' as const,
      cacheStatus: 'fresh' as const,
      outcomeAuthority: 'zero_native' as const
    },
    approvals: { privacy: false, live: false },
    counts: {
      destinations: 2,
      readyDestinations: 0,
      degradedDestinations: 0,
      blockedDestinations: 1,
      capabilities: 4,
      readyCapabilities: 0,
      degradedCapabilities: 0,
      blockedCapabilities: 1,
      activeMappings: 2,
      outcomeEndpoints: 0,
      readyOutcomeEndpoints: 0
    },
    blockers: [{ code: 'destination_not_ready', message: 'Destination evidence is incomplete' }],
    lastValidatedAt: null,
    lastSuccessAt: null,
    ...overrides
  }
}

const stubs = {
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
  UBadge: { props: ['color', 'variant'], template: '<span><slot /></span>' },
  UButton: {
    props: ['disabled', 'loading', 'label'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>'
  },
  UTextarea: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UCheckbox: {
    props: ['modelValue', 'label'],
    emits: ['update:modelValue'],
    template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)">{{ label }}</label>'
  }
}

async function flushUi() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountControls(input: {
  liveEligible?: boolean
  approvals?: { privacy: boolean, live: boolean }
  canOwnerOverride?: boolean
  profile?: typeof profile
} = {}) {
  const fetchMock = vi.fn(async () => ({}))
  Object.assign(globalThis, { $fetch: fetchMock })
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(ClientMeasurementActivationControls, {
      clientId: CLIENT_ID,
      profile: input.profile ?? profile,
      readiness: readiness({
        liveEligible: input.liveEligible ?? false,
        approvals: input.approvals ?? { privacy: false, live: false }
      }),
      canConfigure: true,
      canOwnerOverride: input.canOwnerOverride ?? false
    })
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host, fetchMock }
}

function setTextarea(host: HTMLElement, value: string) {
  const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
  textarea.value = value
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

function confirm(host: HTMLElement) {
  const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  checkbox.checked = true
  checkbox.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('ClientMeasurementActivationControls', () => {
  it('shows consumed governance without pending approval claims after activation', async () => {
    const test = mountControls({
      profile: {
        ...profile,
        enabled: true,
        environment: 'live',
        configVersion: 6,
        cacheVersion: 6
      },
      approvals: { privacy: false, live: false },
      liveEligible: true,
      canOwnerOverride: true
    })
    await flushUi()

    expect(test.host.textContent).toContain('Approval gates were consumed at activation')
    expect(test.host.textContent).not.toContain('Privacy approval pending')
    expect(test.host.textContent).not.toContain('Live approval pending')
    expect(test.host.querySelector('[data-testid="open-owner-override"]')).toBeNull()
    test.app.unmount()
  })

  it('withholds every approval and activation command while the client is opted out', async () => {
    const test = mountControls({
      profile: {
        ...profile,
        desiredEnabled: false,
        desiredStateSource: 'explicit_opt_out'
      },
      approvals: { privacy: false, live: false },
      liveEligible: false,
      canOwnerOverride: true
    })
    await flushUi()

    expect(test.host.textContent).toContain('Measurement signals are off')
    expect(test.host.textContent).toContain('Approvals and activation are unavailable')
    expect(test.host.textContent).not.toContain('Privacy approval pending')
    expect(test.host.querySelector('[data-testid="open-privacy-approval"]')).toBeNull()
    expect(test.host.querySelector('[data-testid="open-live-approval"]')).toBeNull()
    expect(test.host.querySelector('[data-testid="open-owner-override"]')).toBeNull()
    expect(test.host.querySelector('[data-testid="open-live-activation"]')).toBeNull()
    expect(test.fetchMock).not.toHaveBeenCalled()
    test.app.unmount()
  })

  it('records an explicitly confirmed privacy approval for the current config version', async () => {
    const test = mountControls()
    await flushUi()

    test.host.querySelector<HTMLButtonElement>('[data-testid="open-privacy-approval"]')!.click()
    await nextTick()
    setTextarea(test.host, 'Privacy and consent configuration reviewed for the controlled pilot')
    confirm(test.host)
    await nextTick()
    test.host.querySelector<HTMLButtonElement>('[data-testid="submit-governed-command"]')!.click()
    await flushUi()

    expect(test.fetchMock).toHaveBeenCalledWith(
      `/api/agency/measurement/clients/${CLIENT_ID}/approvals`,
      {
        method: 'POST',
        body: {
          expectedConfigVersion: 5,
          approvalKind: 'privacy',
          reason: 'Privacy and consent configuration reviewed for the controlled pilot'
        }
      }
    )
    test.app.unmount()
  })

  it('keeps activation disabled until canonical readiness is live-eligible', async () => {
    const test = mountControls({
      approvals: { privacy: true, live: true },
      liveEligible: false
    })
    await flushUi()

    expect(test.host.querySelector<HTMLButtonElement>('[data-testid="open-live-activation"]')?.disabled)
      .toBe(true)
    expect(test.host.querySelector<HTMLButtonElement>('[data-testid="open-live-activation"]')?.textContent)
      .toContain('Activation blocked')
    expect(test.host.textContent).toContain('A different team member must record the other approval')
    test.app.unmount()
  })

  it('offers the explicit break-glass route only to the application owner', async () => {
    const test = mountControls({
      approvals: { privacy: true, live: false },
      canOwnerOverride: true
    })
    await flushUi()

    const overrideButton = test.host.querySelector<HTMLButtonElement>(
      '[data-testid="open-owner-override"]'
    )
    expect(overrideButton?.textContent).toContain('Owner override')
    overrideButton!.click()
    await nextTick()
    expect(test.host.textContent).toContain('Break-glass owner approval')
    setTextarea(test.host, 'Application owner authorizes the single-owner production launch')
    confirm(test.host)
    await nextTick()
    test.host.querySelector<HTMLButtonElement>('[data-testid="submit-governed-command"]')!.click()
    await flushUi()

    expect(test.fetchMock).toHaveBeenCalledWith(
      `/api/agency/measurement/clients/${CLIENT_ID}/owner-override`,
      {
        method: 'POST',
        body: {
          expectedConfigVersion: 5,
          reason: 'Application owner authorizes the single-owner production launch'
        }
      }
    )
    test.app.unmount()
  })

  it('requires explicit confirmation and then calls the guarded activation endpoint', async () => {
    const test = mountControls({
      approvals: { privacy: true, live: true },
      liveEligible: true
    })
    await flushUi()

    test.host.querySelector<HTMLButtonElement>('[data-testid="open-live-activation"]')!.click()
    await nextTick()
    setTextarea(test.host, 'All controlled-pilot evidence and rollback gates are approved')
    expect(test.host.querySelector<HTMLButtonElement>('[data-testid="submit-governed-command"]')?.disabled)
      .toBe(true)
    confirm(test.host)
    await nextTick()
    test.host.querySelector<HTMLButtonElement>('[data-testid="submit-governed-command"]')!.click()
    await flushUi()

    expect(test.fetchMock).toHaveBeenCalledWith(
      `/api/agency/measurement/clients/${CLIENT_ID}/activate`,
      {
        method: 'POST',
        body: {
          expectedConfigVersion: 5,
          reason: 'All controlled-pilot evidence and rollback gates are approved'
        }
      }
    )
    test.app.unmount()
  })
})
