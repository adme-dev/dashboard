import { describe, it, expect } from 'vitest'
import { applyFieldMapping } from '~~/server/utils/briefConversion/fieldMapping'

describe('applyFieldMapping (revives G3 — carry brief data into the job)', () => {
  it('maps present brief field keys onto their target fields', () => {
    const { mapped, descriptionLines } = applyFieldMapping(
      { client_goal: 'description', target_audience: 'audience' },
      { client_goal: 'Sell more cars', target_audience: 'Geelong locals', unmapped: 'ignored' },
    )
    expect(mapped.description).toBe('Sell more cars')
    expect(mapped.audience).toBe('Geelong locals')
    expect(mapped).not.toHaveProperty('unmapped')
    expect(descriptionLines).toContain('Description: Sell more cars')
    expect(descriptionLines).toContain('Audience: Geelong locals')
  })

  it('skips missing, null, and empty-string field values', () => {
    const { mapped, descriptionLines } = applyFieldMapping(
      { a: 'description', b: 'budget', c: 'deadline' },
      { a: 'kept', b: '', c: null },
    )
    expect(mapped).toEqual({ description: 'kept' })
    expect(descriptionLines).toEqual(['Description: kept'])
  })

  it('stringifies array and object values for the description', () => {
    const { mapped, descriptionLines } = applyFieldMapping(
      { channels: 'channels', meta: 'meta' },
      { channels: ['Google', 'Meta'], meta: { tier: 'gold' } },
    )
    expect(mapped.channels).toEqual(['Google', 'Meta'])
    expect(descriptionLines).toContain('Channels: Google, Meta')
    expect(descriptionLines.some(l => l.startsWith('Meta:'))).toBe(true)
  })

  it('humanizes snake_case and camelCase target labels', () => {
    const { descriptionLines } = applyFieldMapping(
      { x: 'requested_deadline', y: 'targetAudience' },
      { x: '2026-07-01', y: 'Tradies' },
    )
    expect(descriptionLines).toContain('Requested Deadline: 2026-07-01')
    expect(descriptionLines).toContain('Target Audience: Tradies')
  })

  it('returns empty results for null/empty inputs (no regression when unset)', () => {
    expect(applyFieldMapping(null, { a: 1 })).toEqual({ mapped: {}, descriptionLines: [] })
    expect(applyFieldMapping({ a: 'description' }, null)).toEqual({ mapped: {}, descriptionLines: [] })
    expect(applyFieldMapping({}, {})).toEqual({ mapped: {}, descriptionLines: [] })
  })

  it('ignores mapping entries with a falsy/non-string target', () => {
    const { mapped } = applyFieldMapping(
      // @ts-expect-error testing runtime guard against malformed config
      { a: '', b: null, c: 'description' },
      { a: 'x', b: 'y', c: 'z' },
    )
    expect(mapped).toEqual({ description: 'z' })
  })
})
