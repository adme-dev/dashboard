// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type Component } from 'vue'
import {
  audiencePresetRange,
  audienceQueryParams
} from '../../app/composables/useAudienceAnalytics'
import AnalyticsSectionNav from '../../app/components/analytics/AnalyticsSectionNav.vue'
import AudienceFilterBar from '../../app/components/analytics/audiences/FilterBar.vue'

const stubs = {
  UButton: {
    props: ['label', 'to', 'active', 'icon'],
    emits: ['click'],
    template: '<button type="button" :data-to="to" :data-active="active" @click="$emit(\'click\')">{{ label }}<slot /></button>'
  },
  UCard: {
    template: '<section><slot /></section>'
  },
  UFormField: {
    props: ['label'],
    template: '<label><span>{{ label }}</span><slot /></label>'
  },
  UPopover: {
    template: '<div><slot /><slot name="content" /></div>'
  },
  UCalendar: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div data-calendar />'
  },
  USelectMenu: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option>
    </select>`
  },
  UIcon: {
    props: ['name'],
    template: '<i :data-icon="name" />'
  }
}

function mountComponent(component: Component, props: Record<string, unknown>) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(component, props) })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  app.mount(host)
  return { app, host }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('audience analytics date and query state', () => {
  it('creates inclusive 7, 30, and 90 day presets from a literal date', () => {
    const now = new Date('2026-08-01T12:00:00+10:00')
    expect(audiencePresetRange(7, now)).toEqual({ from: '2026-07-26', to: '2026-08-01' })
    expect(audiencePresetRange(30, now)).toEqual({ from: '2026-07-03', to: '2026-08-01' })
    expect(audiencePresetRange(90, now)).toEqual({ from: '2026-05-04', to: '2026-08-01' })
  })

  it('serialises only website audience filters and drops campaign-platform state', () => {
    expect(audienceQueryParams({
      from: '2026-07-03',
      to: '2026-08-01',
      clientId: null,
      metric: 'visitors'
    })).toEqual({ from: '2026-07-03', to: '2026-08-01' })

    expect(audienceQueryParams({
      from: '2026-07-03',
      to: '2026-08-01',
      clientId: '11111111-1111-4111-8111-111111111111',
      metric: 'confirmedLeads'
    })).toEqual({
      from: '2026-07-03',
      to: '2026-08-01',
      clientId: '11111111-1111-4111-8111-111111111111',
      metric: 'confirmedLeads'
    })
  })
})

describe('AnalyticsSectionNav', () => {
  it('provides route-backed campaign and website audience destinations', () => {
    const { app, host } = mountComponent(AnalyticsSectionNav, { active: 'audiences' })
    try {
      const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')]
      expect(buttons.map(button => button.textContent)).toEqual([
        'Campaign performance',
        'Website audiences'
      ])
      expect(buttons.map(button => button.dataset.to)).toEqual([
        '/agency/analytics',
        '/agency/analytics/audiences'
      ])
      expect(buttons[1]?.dataset.active).toBe('true')
    } finally {
      app.unmount()
    }
  })
})

describe('AudienceFilterBar', () => {
  it('uses labelled calendar controls and emits an inclusive preset', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T12:00:00+10:00'))
    const updates: Array<[string, string | null]> = []
    const { app, host } = mountComponent(AudienceFilterBar, {
      'from': '2026-07-03',
      'to': '2026-08-01',
      'clientId': null,
      'availableClients': [{ id: '11111111-1111-4111-8111-111111111111', name: 'Alpha Motors' }],
      'onUpdate:from': (value: string) => updates.push(['from', value]),
      'onUpdate:to': (value: string) => updates.push(['to', value]),
      'onUpdate:clientId': (value: string | null) => updates.push(['clientId', value])
    })

    try {
      expect(host.textContent).toContain('From')
      expect(host.textContent).toContain('To')
      expect(host.textContent).toContain('Client')
      expect(host.querySelectorAll('[data-calendar]')).toHaveLength(2)
      expect(host.querySelector('input[type="date"]')).toBeNull()

      const sevenDay = [...host.querySelectorAll('button')]
        .find(button => button.textContent === '7 days')
      sevenDay?.click()
      await nextTick()
      expect(updates).toContainEqual(['from', '2026-07-26'])
      expect(updates).toContainEqual(['to', '2026-08-01'])

      const clientSelect = host.querySelector('select') as HTMLSelectElement
      expect([...clientSelect.options].map(option => option.value)).toEqual([
        'all',
        '11111111-1111-4111-8111-111111111111'
      ])
    } finally {
      app.unmount()
    }
  })
})

describe('campaign analytics integration', () => {
  it('renders the shared route-backed section navigation', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/pages/agency/analytics/index.vue'),
      'utf8'
    )
    expect(source).toContain('<AnalyticsSectionNav active="performance" />')
  })
})
