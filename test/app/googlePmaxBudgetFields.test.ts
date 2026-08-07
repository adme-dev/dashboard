// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computed, createApp, h, nextTick, onMounted, ref } from 'vue'

import BriefFormRenderer from '~~/app/components/briefs/BriefFormRenderer.vue'

Object.assign(globalThis, {
  computed,
  onMounted,
  ref,
  useToast: () => ({ add: () => {} })
})

const fields = [
  { id: 'client', fieldKey: 'client', fieldLabel: 'Client', fieldType: 'client', isRequired: true, stepNumber: 1, stepTitle: 'Setup', section: 'Basics', width: 'full', sortOrder: 1 },
  { id: 'campaign', fieldKey: 'campaign_name', fieldLabel: 'Campaign Name', fieldType: 'text', isRequired: true, stepNumber: 1, stepTitle: 'Setup', section: 'Basics', width: 'full', sortOrder: 2 },
  { id: 'type', fieldKey: 'pmax_type', fieldLabel: 'Campaign Type', fieldType: 'dropdown', isRequired: true, stepNumber: 1, stepTitle: 'Setup', section: 'Basics', width: 'half', sortOrder: 3 },
  { id: 'goal', fieldKey: 'conversion_goal', fieldLabel: 'Conversion Goal', fieldType: 'dropdown', isRequired: true, stepNumber: 1, stepTitle: 'Setup', section: 'Basics', width: 'half', sortOrder: 4 },
  { id: 'period', fieldKey: 'budget_period', fieldLabel: 'Budget Period', fieldType: 'dropdown', isRequired: true, stepNumber: 4, stepTitle: 'Budget & Geo', section: 'Budget', width: 'half', sortOrder: 1 },
  { id: 'total', fieldKey: 'allocated_total', fieldLabel: 'Approved Total Allocation', fieldType: 'currency', isRequired: true, stepNumber: 4, stepTitle: 'Budget & Geo', section: 'Budget', width: 'half', sortOrder: 2 },
  { id: 'currency', fieldKey: 'budget_currency', fieldLabel: 'Budget Currency', fieldType: 'dropdown', isRequired: true, stepNumber: 4, stepTitle: 'Budget & Geo', section: 'Budget', width: 'half', sortOrder: 3 },
  { id: 'start', fieldKey: 'start_date', fieldLabel: 'Start Date', fieldType: 'date', isRequired: true, stepNumber: 4, stepTitle: 'Budget & Geo', section: 'Budget', width: 'half', sortOrder: 9 },
  { id: 'end', fieldKey: 'end_date', fieldLabel: 'End Date', fieldType: 'date', isRequired: true, stepNumber: 4, stepTitle: 'Budget & Geo', section: 'Budget', width: 'half', sortOrder: 10 }
]

const template = {
  id: 'google-pmax-template',
  slug: 'google-pmax',
  name: 'Google Performance Max',
  isMultiStep: true,
  showProgress: true,
  allowDrafts: true,
  fields
}

const stubs = {
  BriefsBriefFormField: {
    name: 'BriefsBriefFormField',
    props: ['field', 'modelValue'],
    template: '<div :data-field="field.fieldKey">{{ field.fieldLabel }}: {{ modelValue }}</div>'
  },
  UButton: {
    name: 'UButton',
    emits: ['click'],
    template: '<button @click="$emit(\'click\', $event)"><slot /></button>'
  },
  UIcon: { name: 'UIcon', template: '<i />' },
  UProgress: { name: 'UProgress', template: '<div />' }
}

async function mountRenderer(overrides: Record<string, unknown> = {}) {
  const submissions: Array<Record<string, unknown>> = []
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(BriefFormRenderer, {
      template,
      initialValues: {
        client: 'client-1',
        campaign_name: 'CP Ford PMax Inventory',
        pmax_type: 'inventory',
        conversion_goal: 'leads',
        budget_period: 'fixed_flight',
        allocated_total: 1_000,
        budget_currency: 'AUD',
        start_date: '2026-07-17',
        end_date: '2026-07-31',
        ...overrides
      },
      onSubmit: (values: Record<string, unknown>) => submissions.push(values)
    })
  })

  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  await nextTick()

  const budgetStep = Array.from(host.querySelectorAll('button'))
    .find(button => button.textContent?.includes('Budget & Geo')) as HTMLButtonElement
  budgetStep.click()
  await nextTick()

  return { app, host, submissions }
}

describe('Google PMax brief budget fields', () => {
  it('shows the CP Ford total, inclusive days, pace and exact provider semantics together', async () => {
    const { app, host } = await mountRenderer()

    try {
      expect(host.textContent).toContain('AUD 1,000.00 total')
      expect(host.textContent).toContain('15 inclusive days')
      expect(host.textContent).toContain('AUD 66.67/day')
      expect(host.textContent).toContain('CUSTOM_PERIOD')
      expect(host.textContent).toContain('total_amount_micros = 1000000000')
    } finally {
      app.unmount()
    }
  })

  it('does not submit calculated days or pace as authoritative brief values', async () => {
    const { app, host, submissions } = await mountRenderer()

    try {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await nextTick()

      expect(submissions).toHaveLength(1)
      expect(submissions[0]).not.toHaveProperty('campaign_days')
      expect(submissions[0]).not.toHaveProperty('calculated_daily_pace')
    } finally {
      app.unmount()
    }
  })

  it('does not claim Inventory provider semantics for PMax Standard', async () => {
    const { app, host } = await mountRenderer({ pmax_type: 'standard' })

    try {
      expect(host.textContent).not.toContain('Google provider contract')
      expect(host.textContent).not.toContain('total_amount_micros')
    } finally {
      app.unmount()
    }
  })

  it('does not preview a provider contract for impossible calendar dates', async () => {
    const { app, host } = await mountRenderer({
      start_date: '2026-02-31',
      end_date: '2026-03-05'
    })

    try {
      expect(host.textContent).not.toContain('Google provider contract')
      expect(host.textContent).not.toContain('total_amount_micros')
    } finally {
      app.unmount()
    }
  })

  it('uses the Nuxt UI calendar pattern instead of a native date input', () => {
    const fieldComponent = readFileSync(
      resolve(process.cwd(), 'app/components/briefs/BriefFormField.vue'),
      'utf8'
    )

    expect(fieldComponent).toContain('<UCalendar v-model="dateModel"')
    expect(fieldComponent).not.toMatch(/<UInput[\s\S]{0,160}type="date"/)
  })
})
