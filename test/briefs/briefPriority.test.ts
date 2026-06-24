import { describe, it, expect } from 'vitest'
import { normalizeBriefPriority, BRIEF_PRIORITIES } from '~~/server/utils/briefPriority'

describe('normalizeBriefPriority', () => {
  it('passes through every valid column tier unchanged', () => {
    for (const p of BRIEF_PRIORITIES) {
      expect(normalizeBriefPriority(p)).toBe(p)
    }
  })

  it('maps the support taxonomy "critical" onto "urgent" (the column has no critical)', () => {
    // This is the exact 500-on-submit bug guarded here: support templates offer
    // a Critical tier; briefs_priority_check only allows low/medium/high/urgent.
    expect(normalizeBriefPriority('critical')).toBe('urgent')
    expect(normalizeBriefPriority('asap')).toBe('urgent')
  })

  it('maps the graphic-design "normal" tier onto "medium"', () => {
    expect(normalizeBriefPriority('normal')).toBe('medium')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeBriefPriority('  Critical ')).toBe('urgent')
    expect(normalizeBriefPriority('HIGH')).toBe('high')
  })

  it('falls back to the template default when the value is missing/invalid', () => {
    expect(normalizeBriefPriority(undefined, 'high')).toBe('high')
    expect(normalizeBriefPriority('', 'critical')).toBe('urgent') // default also coerced
    expect(normalizeBriefPriority(null, 'low')).toBe('low')
  })

  it('defaults to "medium" when neither value nor fallback is usable', () => {
    expect(normalizeBriefPriority(undefined)).toBe('medium')
    expect(normalizeBriefPriority('garbage', 'also-garbage')).toBe('medium')
    expect(normalizeBriefPriority(42 as unknown)).toBe('medium')
    expect(normalizeBriefPriority(['high'] as unknown)).toBe('medium')
  })
})
