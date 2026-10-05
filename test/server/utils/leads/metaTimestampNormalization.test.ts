import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeMetaPayload } from '~~/server/utils/leads/normalizer'
import { AppendCanonicalConversionEventSchema } from '~~/server/utils/measurement/contracts'

const lead = {
  id: '1092498590251555',
  form_id: '4323426637875349',
  field_data: [{ name: 'email', values: ['test@example.test'] }]
}

describe('Meta lead timestamp normalization', () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    ['2026-10-05T05:19:32+0000', '2026-10-05T05:19:32.000Z'],
    ['2026-10-05T15:19:32+1000', '2026-10-05T05:19:32.000Z'],
    ['2026-10-05T05:19:32Z', '2026-10-05T05:19:32.000Z'],
    ['2026-10-05T15:19:32.123+10:00', '2026-10-05T05:19:32.123Z']
  ])('normalizes %s without changing its instant for canonical intake', (createdTime, expected) => {
    const normalized = normalizeMetaPayload({ ...lead, created_time: createdTime }, 'page-1', 'client-1')
    expect(normalized.submitted_at).toBe(expected)
    expect(AppendCanonicalConversionEventSchema.shape.occurredAt.parse(normalized.submitted_at)).toBe(expected)
  })

  it('preserves the missing timestamp fallback', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T05:20:00Z'))
    expect(normalizeMetaPayload(lead, 'page-1', 'client-1').submitted_at).toBe('2026-10-05T05:20:00.000Z')
  })

  it.each(['not-a-date', '', '2026-99-05T05:19:32+0000'])(
    'rejects an invalid present timestamp %j instead of substituting the receipt time', (createdTime) => {
      expect(() => normalizeMetaPayload({ ...lead, created_time: createdTime }, 'page-1', 'client-1'))
        .toThrow('Invalid Meta lead timestamp')
    }
  )
})
