// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createApp, h, nextTick } from 'vue'
import AudienceAnalyst from '../../app/components/analytics/audiences/Analyst.client.vue'

const fetchMock = vi.fn()

const response = {
  answer: 'Visitors increased while confirmed leads held steady. Review the high-intent segment before changing media activity.',
  generatedAt: '2026-08-01T02:00:00.000Z',
  grounding: {
    window: {
      fromDate: '2026-07-03',
      toDate: '2026-08-01',
      previousFromDate: '2026-06-03',
      previousToDate: '2026-07-02',
      days: 30
    },
    scope: 'agency',
    kpis: {
      visitors: 1200,
      sessions: 1500,
      pageViews: 4200,
      engagedSessions: 900,
      engagementRate: 60,
      repeatVisitors: 240,
      leadActions: 96,
      confirmedLeads: 48,
      visitorToLeadRate: 4,
      attributionCoverage: 75
    },
    previousKpis: {
      visitors: 1000,
      sessions: 1300,
      pageViews: 3900,
      engagedSessions: 780,
      engagementRate: 60,
      repeatVisitors: 180,
      leadActions: 80,
      confirmedLeads: 48,
      visitorToLeadRate: 4.8,
      attributionCoverage: 70
    },
    opportunities: [{
      code: 'high_intent_non_converters',
      title: 'High-intent visitors without a confirmed lead',
      description: 'Visitors completed high-intent actions without a linked lead.',
      status: 'opportunity',
      count: 28,
      thresholds: { minimumVisitors: 20 },
      evidence: { highIntentVisitors: 28 }
    }],
    breakdowns: {
      source: [{
        key: 'google',
        visitors: 700,
        sessions: 850,
        engagementRate: 63,
        leadActions: 60,
        confirmedLeads: 32,
        confirmedLeadRate: 3.8
      }]
    }
  }
}

const stubs = {
  UCard: { template: '<section><slot name="header" /><slot /><slot name="footer" /></section>' },
  UFormField: {
    props: ['label', 'error', 'help'],
    template: '<label><span>{{ label }}</span><slot /><small v-if="error">{{ error }}</small><small v-else-if="help">{{ help }}</small></label>'
  },
  UTextarea: {
    props: ['modelValue', 'placeholder', 'disabled'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" :placeholder="placeholder" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UButton: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}<slot /></button>'
  },
  UAlert: {
    props: ['title', 'description'],
    template: '<aside>{{ title }} {{ description }}<slot /><slot name="actions" /></aside>'
  },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  UTable: {
    props: ['data'],
    template: '<div data-table>{{ JSON.stringify(data) }}</div>'
  }
}

function mountAnalyst() {
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(AudienceAnalyst, {
      from: '2026-07-03',
      to: '2026-08-01',
      clientId: null
    })
  })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  app.mount(host)
  return { app, host }
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(candidate => candidate.textContent?.trim() === label)
}

beforeEach(() => {
  vi.stubGlobal('$fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Audience analyst', () => {
  it('is composed below audience filters with the active date and client scope', () => {
    const source = readFileSync('app/pages/agency/analytics/audiences.vue', 'utf8')
    expect(source).toContain('<AnalyticsAudiencesAnalyst')
    expect(source).toContain(':from="filters.from"')
    expect(source).toContain(':to="filters.to"')
    expect(source).toContain(':client-id="filters.clientId"')
  })

  it('does not call the model until the user asks for analysis', () => {
    const { app } = mountAnalyst()
    try {
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      app.unmount()
    }
  })

  it('generates the approved briefing for the active reporting scope', async () => {
    fetchMock.mockResolvedValue(response)
    const { app, host } = mountAnalyst()
    try {
      button(host, 'Generate audience briefing')?.click()
      await settle()

      expect(fetchMock).toHaveBeenCalledWith('/api/agency/tracking/audiences/ask', {
        method: 'POST',
        body: {
          question: 'Brief the marketing team on this audience window.',
          from: '2026-07-03',
          to: '2026-08-01',
          clientId: undefined
        }
      })
      expect(host.textContent).toContain(response.answer)
      expect(host.textContent).toContain('Agency scope')
      expect(host.textContent).toContain('2026-07-03 to 2026-08-01')
      expect(button(host, 'Show supporting evidence')).toBeTruthy()
    } finally {
      app.unmount()
    }
  })

  it('blocks questions over 500 characters before any request', async () => {
    const { app, host } = mountAnalyst()
    try {
      const textarea = host.querySelector('textarea') as HTMLTextAreaElement
      textarea.value = 'x'.repeat(501)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()

      expect(host.textContent).toContain('Question must be 500 characters or fewer')
      button(host, 'Ask analyst')?.click()
      await settle()
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      app.unmount()
    }
  })

  it('discloses only aggregate KPI, opportunity, and breakdown evidence', async () => {
    fetchMock.mockResolvedValue(response)
    const { app, host } = mountAnalyst()
    try {
      button(host, 'Generate audience briefing')?.click()
      await settle()
      button(host, 'Show supporting evidence')?.click()
      await nextTick()

      expect(host.textContent).toContain('Visitors')
      expect(host.textContent).toContain('High-intent visitors without a confirmed lead')
      expect(host.textContent).toContain('google')
      expect(host.textContent).not.toMatch(/anonymous[_-]?id|session[_-]?id|click[_-]?id|fingerprint|email|phone/i)
    } finally {
      app.unmount()
    }
  })

  it('keeps a deterministic fallback and permits retry after model failure', async () => {
    fetchMock.mockRejectedValueOnce({ data: { statusCode: 502 } }).mockResolvedValueOnce(response)
    const { app, host } = mountAnalyst()
    try {
      button(host, 'Generate audience briefing')?.click()
      await settle()
      expect(host.textContent).toContain('The verified dashboard evidence above is unchanged')

      button(host, 'Retry')?.click()
      await settle()
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(host.textContent).toContain(response.answer)
    } finally {
      app.unmount()
    }
  })
})
