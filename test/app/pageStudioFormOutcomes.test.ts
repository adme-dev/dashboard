import { describe, expect, it } from 'vitest'
import { FormOutcomeSchema, FormOutcomeSettingsSchema, evaluateFormOutcome, validateFormOutcomeFields } from '../../shared/pageStudio/formOutcomes'

const fallback = { type: 'message' as const, message: 'Thank you for your enquiry.' }
const settings = { fallback, rules: [
  { fieldId: 'passengers', operator: 'greater_than' as const, value: '6', outcome: { type: 'redirect' as const, path: '/group-travel' } },
  { fieldId: 'occasion', operator: 'equals' as const, value: 'Wedding', outcome: { type: 'redirect' as const, path: '/weddings/thank-you' } }
] }

describe('form outcomes', () => {
  it.each(['https://evil.example', '//evil.example', '/\\evil', '/%2f%2fevil', '/%252fevil', '/a/../b', '/a/%2e%2e/b', '/thanks?email={{email}}', '/thanks#x', 'javascript:alert(1)', '/thanks\n', '/api/forms/x', '/thanks//x'])('rejects unsafe or non-page redirect %s', (path) => {
    expect(FormOutcomeSchema.safeParse({ type: 'redirect', path }).success).toBe(false)
  })
  it('accepts a fixed local page path and rejects extra fields', () => {
    expect(FormOutcomeSchema.parse({ type: 'redirect', path: '/weddings/thank-you' })).toEqual({ type: 'redirect', path: '/weddings/thank-you' })
    expect(FormOutcomeSchema.safeParse({ type: 'redirect', path: '/thanks', query: '{{email}}' }).success).toBe(false)
  })
  it('chooses first match and deterministic fallback without mutating or returning answers', () => {
    expect(evaluateFormOutcome(settings, { passengers: '7', occasion: 'Wedding', email: 'private@example.test' })).toEqual({ outcome: settings.rules[0]!.outcome, matchedRule: 0 })
    expect(evaluateFormOutcome(settings, { passengers: '6', occasion: 'Wedding' }).matchedRule).toBe(1)
    expect(evaluateFormOutcome(settings, {}).outcome).toEqual(fallback)
    expect(evaluateFormOutcome(settings, { passengers: 'Infinity' }).outcome).toEqual(fallback)
  })
  it('requires known visible fields and numeric operators on numeric fields', () => {
    const fields = [{ id: 'passengers', type: 'number' }, { id: 'occasion', type: 'select' }]
    expect(validateFormOutcomeFields(settings, fields)).toEqual([])
    expect(validateFormOutcomeFields(settings, [{ id: 'passengers', type: 'hidden' }])).toHaveLength(2)
    expect(validateFormOutcomeFields(settings, [{ id: 'passengers', type: 'text' }, fields[1]!])).toHaveLength(1)
  })
  it('rejects empty numeric comparisons and oversized rules', () => {
    expect(FormOutcomeSettingsSchema.safeParse({ ...settings, rules: [{ ...settings.rules[0], value: '' }] }).success).toBe(false)
    expect(FormOutcomeSettingsSchema.safeParse({ ...settings, rules: Array(21).fill(settings.rules[0]) }).success).toBe(false)
  })
})
