import { describe, expect, it, vi } from 'vitest'
import { mutatePageStudioHistory } from '~~/server/utils/pageStudio/draftHistory'

describe('native history login boundary', () => {
  it('requires the originating HTTP login before opening a write transaction', async () => {
    const runTransaction = vi.fn(() => {
      throw new Error('Unexpected unauthenticated database access')
    })
    await expect(mutatePageStudioHistory({
      actor: { role: 'agency', actorId: '30000000-0000-4000-8000-000000000501', tenantId: 'test', canEdit: true },
      siteId: '10000000-0000-4000-8000-000000000501',
      body: { action: 'name', name: 'Before redesign', expectedCheckpointId: 'current', requestId: '20000000-0000-4000-8000-000000000501' }
    }, { runTransaction })).rejects.toMatchObject({ statusCode: 401 })
    expect(runTransaction).not.toHaveBeenCalled()
  })
})
