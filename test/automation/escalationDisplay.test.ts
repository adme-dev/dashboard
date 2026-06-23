import { describe, expect, it } from 'vitest'
import { severityMeta, summarizeProposedAction, SEVERITY_ORDER } from '~/utils/escalationDisplay'

describe('severityMeta', () => {
  it('maps each severity to a Nuxt UI color, icon, label, and accent', () => {
    expect(severityMeta('critical')).toMatchObject({ label: 'Critical', color: 'error' })
    expect(severityMeta('warning')).toMatchObject({ label: 'Warning', color: 'warning' })
    expect(severityMeta('info')).toMatchObject({ label: 'Info', color: 'neutral' })
    for (const s of ['critical', 'warning', 'info']) {
      const m = severityMeta(s)
      expect(typeof m.icon).toBe('string')
      expect(m.icon.startsWith('i-lucide-')).toBe(true)
      expect(typeof m.accentClass).toBe('string')
      expect(m.accentClass.length).toBeGreaterThan(0)
    }
  })

  it('falls back to info for an unknown severity', () => {
    expect(severityMeta('bogus')).toMatchObject({ label: 'Info', color: 'neutral' })
  })

  it('orders severities critical → warning → info', () => {
    expect(SEVERITY_ORDER).toEqual(['critical', 'warning', 'info'])
  })
})

describe('summarizeProposedAction', () => {
  it('returns null when there is no proposed action', () => {
    expect(summarizeProposedAction(null)).toBeNull()
    expect(summarizeProposedAction(undefined)).toBeNull()
    expect(summarizeProposedAction({} as any)).toBeNull()
  })

  it('summarizes a budget_change action in plain language', () => {
    expect(summarizeProposedAction({ type: 'budget_change', from: 50, to: 80 }))
      .toBe('Change daily budget $50 → $80')
  })

  it('summarizes a campaign_status action', () => {
    expect(summarizeProposedAction({ type: 'campaign_status', status: 'paused' }))
      .toBe('Set campaign status to paused')
  })

  it('falls back to a compact key/value summary for unknown shapes', () => {
    const out = summarizeProposedAction({ type: 'something_new', foo: 'bar', n: 3 })
    expect(out).toContain('something_new')
    expect(out).toContain('foo')
    expect(out).toContain('bar')
  })
})
