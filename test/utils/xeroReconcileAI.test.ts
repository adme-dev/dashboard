// test/utils/xeroReconcileAI.test.ts
import { describe, it, expect } from 'vitest'
import { parseAiGrouping } from '~~/server/utils/xeroReconcileAI'

const valid = new Set(['c-gws'])

describe('parseAiGrouping', () => {
  it('keeps an existing decision with a valid clientId', () => {
    const raw = JSON.stringify({ items: [
      { contactId: 'x1', xeroName: 'GWS Kia', decision: 'existing', clientId: 'c-gws', confidence: 0.9, reason: 'GWS = Garry and Warren Smith' }
    ]})
    const out = parseAiGrouping(raw, valid)
    expect(out[0]).toMatchObject({ contactId: 'x1', decision: 'existing', clientId: 'c-gws' })
  })

  it('demotes an existing decision with an unknown clientId to new_group, confidence 0', () => {
    const raw = JSON.stringify({ items: [
      { contactId: 'x2', xeroName: 'Geely Ringwood', decision: 'existing', clientId: 'c-nope', confidence: 0.8 }
    ]})
    const out = parseAiGrouping(raw, valid)
    expect(out[0].decision).toBe('new_group')
    expect(out[0].confidence).toBe(0)
    expect(out[0].proposedGroupName).toBe('Geely Ringwood')
  })

  it('defaults a new_group without a name to the xero name', () => {
    const raw = JSON.stringify({ items: [
      { contactId: 'x3', xeroName: 'Harmony New Energy', decision: 'new_group', confidence: 0.7 }
    ]})
    expect(parseAiGrouping(raw, valid)[0].proposedGroupName).toBe('Harmony New Energy')
  })

  it('strips ```json fences before parsing', () => {
    const raw = '```json\n{"items":[{"contactId":"x4","xeroName":"Knox GWM","decision":"new_group","confidence":0.6}]}\n```'
    expect(parseAiGrouping(raw, valid)).toHaveLength(1)
  })

  it('throws on unparseable output', () => {
    expect(() => parseAiGrouping('not json at all', valid)).toThrow()
  })
})
