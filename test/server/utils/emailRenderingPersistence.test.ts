import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTemplate, updateTemplate } from '../../../server/utils/email-marketing/templates'
import { createCampaign, updateCampaign } from '../../../server/utils/email-marketing/campaigns'
import { createEmailRenderer } from '../../../server/utils/email-marketing/render/client'

const { queryOne } = vi.hoisted(() => ({ queryOne: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne, queryRows: vi.fn(), execute: vi.fn(), transaction: vi.fn() }))
const document = { root: { type: 'EmailLayout', data: { childrenIds: [] } } }
const existing = { id: 'one', name: 'Draft', status: 'draft', body_source: document, subject: null, preview_text: null }
const result = { version: 1, environment: 'staging', operation: 'document', ok: true, value: { html: '<p>Rendered</p>' } }
const writes = () => queryOne.mock.calls.filter(([sql]) => /INSERT|UPDATE/.test(sql))
const operations = [
  ['create template', (renderer: ReturnType<typeof createEmailRenderer>) => createTemplate({ name: 'Draft', created_by: null, body_source: document }, renderer)],
  ['update template', (renderer: ReturnType<typeof createEmailRenderer>) => updateTemplate('one', { subject: 'New subject' }, renderer)],
  ['create campaign', (renderer: ReturnType<typeof createEmailRenderer>) => createCampaign({ name: 'Draft', created_by: null, body_source: document }, renderer)],
  ['update campaign', (renderer: ReturnType<typeof createEmailRenderer>) => updateCampaign('one', { subject: 'New subject' }, renderer)]
] as const
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (error: Error) => void
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  void promise.catch(() => {})
  const render = vi.fn(() => promise)
  return { resolve, reject, render, client: createEmailRenderer({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', EMAIL_RENDERER: { render } }) }
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
beforeEach(() => {
  queryOne.mockReset()
  queryOne.mockResolvedValue(existing)
})
describe('rendering completes before SQL mutations', () => {
  it.each(operations)('%s waits for rendering before persisting HTML', async (_name, operation) => {
    const d = deferred()
    const pending = operation(d.client)
    await flush()
    expect(writes()).toHaveLength(0)
    expect(d.render).toHaveBeenCalledOnce()
    d.resolve(result)
    await pending
    expect(writes()).toHaveLength(1)
    expect(writes()[0]![1]).toContain('<p>Rendered</p>')
  })
  it.each(operations)('%s cannot write after a redacted render failure', async (_name, operation) => {
    const d = deferred()
    const pending = operation(d.client)
    const check = expect(pending).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Email rendering is temporarily unavailable.' })
    await flush()
    d.reject(new Error('private payload'))
    await check
    expect(writes()).toHaveLength(0)
  })
  it('cannot overwrite a campaign scheduled while its render is pending', async () => {
    let status = 'draft'
    queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) return { ...existing, status }
      return /AND status\s*=\s*'draft'/.test(sql) && status !== 'draft' ? null : existing
    })
    const d = deferred()
    const pending = updateCampaign('one', { subject: 'Changed' }, d.client)
    await flush()
    status = 'scheduled'
    d.resolve(result)
    await expect(pending).rejects.toMatchObject({ statusCode: 409, statusMessage: 'campaign_not_editable' })
  })
})
