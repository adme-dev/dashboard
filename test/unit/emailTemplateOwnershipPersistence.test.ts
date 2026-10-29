import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testEmailRenderer } from '../fixtures/emailRenderer'
const db = vi.hoisted(() => ({ queryOne: vi.fn(), queryOneFresh: vi.fn(), queryRowsFresh: vi.fn(), execute: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)
import { deleteTemplate, updateTemplate } from '../../server/utils/email-marketing/templates'
beforeEach(() => { vi.clearAllMocks(); db.queryOneFresh.mockImplementation((...args) => db.queryOne(...args)) })
describe('template client and category persistence', () => {
  it.each([undefined, null, 'new-client'])('preserves omitted client and persists explicit target %s', async (clientId) => {
    db.queryOne.mockResolvedValueOnce({ name: 'Existing', client_id: 'old-client', folder_name: 'Original', body_source: {}, template_kind: 'template' }).mockResolvedValueOnce({ id: 'template' })
    await updateTemplate('template', { client_id: clientId, folder_name: '  Newsletter  ' }, testEmailRenderer)
    const [sql, params] = db.queryOne.mock.calls[1]
    expect(sql).toContain('client_id = $8')
    expect(params[6]).toBe('Newsletter')
    expect(params[7]).toBe(clientId === undefined ? 'old-client' : clientId)
    expect(params[8]).toBe('template')
    expect(sql).toContain('client_id IS NOT DISTINCT FROM $10::uuid')
    expect(params[9]).toBe('old-client')
  })
  it('refuses an update if ownership changed after authorization', async () => {
    db.queryOne.mockResolvedValueOnce({ name: 'Moved', client_id: 'new-client', body_source: {} })
    expect(await updateTemplate('template', { name: 'Stale edit' }, testEmailRenderer, 'old-client')).toBeNull()
    expect(db.queryOne).toHaveBeenCalledTimes(1)
  })
  it('deletes only when the authorized owner still matches', async () => {
    db.queryOne.mockResolvedValueOnce(null)
    expect(await deleteTemplate('template', 'old-client')).toBe(false)
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringContaining('client_id IS NOT DISTINCT FROM $2::uuid'), ['template', 'old-client'])
  })
})
