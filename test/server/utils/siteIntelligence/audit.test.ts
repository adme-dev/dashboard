import { describe, expect, it } from 'vitest'

import { writeSiteIntelligenceAudit } from '~~/server/utils/siteIntelligence/audit'

const clientId = '11111111-1111-4111-8111-111111111111'
const candidateId = '22222222-2222-4222-8222-222222222222'
const clientUserId = '33333333-3333-4333-8333-333333333333'

describe('site intelligence audit', () => {
  it('records a client actor in the dedicated nullable audit column', async () => {
    const calls: unknown[][] = []
    const query = async <T>(sql: string, params?: unknown[]) => {
      calls.push([sql, params])
      return { rows: [{ id: 'audit-id' }] as T[] }
    }

    await expect(writeSiteIntelligenceAudit(
      { id: null, clientUserId },
      clientId,
      'candidate.nominated',
      'candidate',
      candidateId,
      { marketLocationId: candidateId },
      { query }
    )).resolves.toBe('audit-id')

    expect(calls).toEqual([[
      expect.stringContaining('client_actor_id'),
      [
        clientId,
        null,
        'candidate.nominated',
        'candidate',
        candidateId,
        JSON.stringify({ marketLocationId: candidateId }),
        clientUserId
      ]
    ]])
  })
})
