import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMergeDefinition, updateMergeDefinition, deleteMergeDefinition, listMergeDefinitions } from '../../server/utils/email-marketing/mergeTagDefinitions'

const mocks = vi.hoisted(() => ({ one: vi.fn(), rows: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.one, queryRows: mocks.rows }))
beforeEach(() => vi.clearAllMocks())
describe('client-bound merge definition storage', () => {
  it('uses a client predicate for every read and mutation, never campaign/snapshot storage', async () => {
    const input = { client_id: 'client-a', token: 'custom_offer', name: 'Offer', preview_value: 'Preview', fallback: 'Fallback' }
    await listMergeDefinitions('client-a')
    await createMergeDefinition(input)
    await updateMergeDefinition('definition', 'client-a', { preview_value: '', fallback: 'Changed' })
    await deleteMergeDefinition('definition', 'client-a')
    expect(mocks.rows.mock.calls[0][0]).toContain('WHERE client_id = $1')
    const update = mocks.one.mock.calls[1]
    expect(update[0]).toContain('WHERE id = $1 AND client_id = $2')
    expect(update[1]).toEqual(['definition', 'client-a', null, '', 'Changed'])
    expect(mocks.one.mock.calls[2][0]).toContain('WHERE id = $1 AND client_id = $2')
    for (const call of [...mocks.one.mock.calls, ...mocks.rows.mock.calls]) expect(call[0]).not.toMatch(/email_campaigns|recipient_snapshot|subscribers/)
  })
})
