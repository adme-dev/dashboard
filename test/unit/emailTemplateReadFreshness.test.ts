import { describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ queryOne: vi.fn(), queryOneFresh: vi.fn(), queryRowsFresh: vi.fn(), execute: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)
import { getTemplate, listTemplates } from '../../server/utils/email-marketing/templates'
describe('template library freshness', () => {
  it('uses uncached scoped library reads after template writes', async () => {
    db.queryRowsFresh.mockResolvedValueOnce([])
    await listTemplates(['allowed-client'])
    expect(db.queryRowsFresh).toHaveBeenCalledWith(expect.stringContaining('client_id = ANY'), [['allowed-client']])
    expect(db.queryOne).not.toHaveBeenCalled()
  })
  it('uses a fresh ownership read before edit/delete authority checks', async () => {
    db.queryOneFresh.mockResolvedValueOnce(null)
    expect(await getTemplate('deleted')).toBeNull()
    expect(db.queryOneFresh).toHaveBeenCalledWith('SELECT * FROM edm_templates WHERE id = $1', ['deleted'])
  })
})
