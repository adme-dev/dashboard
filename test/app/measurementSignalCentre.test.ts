// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type Component } from 'vue'
import SignalOverview from '~~/app/components/measurement/SignalOverview.vue'
import SignalEventExplorer from '~~/app/components/measurement/SignalEventExplorer.vue'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const uiStubs = {
  UBadge: { props: ['label'], template: '<span><slot />{{ label }}</span>' },
  UButton: {
    inheritAttrs: false,
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>'
  },
  UFormField: { props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  USelectMenu: {
    inheritAttrs: false,
    props: ['modelValue', 'items', 'valueKey'],
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item[valueKey || \'value\']" :value="item[valueKey || \'value\']">{{ item.label }}</option></select>'
  },
  UTable: { props: ['data'], template: '<div data-table><slot />{{ data?.length ?? 0 }}</div>' },
  USlideover: { props: ['open', 'title'], template: '<aside v-if="open"><h2>{{ title }}</h2><slot name="body" /><slot name="content" /></aside>' },
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' }
} satisfies Record<string, Component>

async function flushUi() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('agency measurement Signal Centre', () => {
  it('renders signal health, confirmed conversions, and the redacted lineage explorer', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => ({
      items: [{
        eventId: '22222222-2222-4222-8222-222222222222',
        eventName: 'web_conversion',
        occurredAt: '2026-09-04T01:02:03.000Z',
        recordedAt: '2026-09-04T01:02:04.000Z',
        consentState: 'granted',
        mappingVersion: 7,
        destination: {
          id: '33333333-3333-4333-8333-333333333333',
          platform: 'tiktok'
        },
        outcome: 'accepted',
        outcomeAt: '2026-09-04T01:02:05.000Z',
        receiptId: 'safe-request-1',
        redactedReason: null
      }],
      nextCursor: null
    })))

    const host = document.createElement('div')
    const app = createApp({
      render: () => h('main', [
        h(SignalOverview, {
          summary: {
            captured: 100,
            confirmed: 4,
            consentGranted: 60,
            policySkipped: 40,
            delivered: 3,
            retrying: 1,
            failed: 2,
            identifierCoverage: {
              ttclid: 12,
              ttp: 10,
              fbc: 20,
              fbp: 24,
              gclid: 31,
              gbraid: 4,
              wbraid: 3
            },
            freshnessAt: '2026-09-04T01:02:05.000Z'
          },
          pending: false,
          error: null
        }),
        h(SignalEventExplorer, { clientId: CLIENT_ID })
      ])
    })
    Object.entries(uiStubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)
    await flushUi()

    try {
      expect(host.textContent).toContain('Signal health')
      expect(host.textContent).toContain('Confirmed conversions')
      expect(host.querySelector('[data-testid="measurement-event-lineage"]')).not.toBeNull()
      expect(host.textContent).toContain('TikTok')
      expect(host.innerHTML).not.toMatch(/accessToken|credentialRef|ttclid-raw|ttp-raw/i)
    } finally {
      app.unmount()
    }
  })

  it('keeps configuration mutations inside the existing governed measurement panel', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'app/pages/agency/measurement/[clientId].vue'),
      'utf8'
    )
    expect(page).toContain('<ClientsClientMeasurementPanel')
    expect(page).toContain('<MeasurementSignalOverview')
    expect(page).toContain('<MeasurementSignalEventExplorer')
    expect(page).not.toMatch(/<input|<select|<button/i)

    const panel = readFileSync(
      resolve(process.cwd(), 'app/components/clients/ClientMeasurementPanel.vue'),
      'utf8'
    )
    expect(panel).toContain('/agency/measurement/${clientId}')
  })
})
