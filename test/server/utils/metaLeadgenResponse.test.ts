import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMetaLeadgen } from '~~/server/utils/metaClient'
import { normalizeMetaPayload } from '~~/server/utils/leads/normalizer'

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
// Keep ofetch's REAL response parser: a mocked ofetch object response would
// miss JSON served with a text/javascript content type entirely.
vi.mock('ofetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ofetch')>()
  return { ...actual, ofetch: actual.createFetch({ fetch: mocks.fetch }) }
})

const id = '1760233211899224'
const lead = { id, form_id: '4323426637875349', field_data: [{ name: 'email', values: ['test@example.test'] }] }
function respond(body: unknown, contentType = 'application/json') {
  mocks.fetch.mockImplementation(async () => new Response(JSON.stringify(body), { headers: { 'content-type': contentType } }))
}
describe('Meta lead response decoding', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it.each(['application/json; charset=UTF-8', 'text/javascript; charset=UTF-8'])(
    'decodes %s as a lead object and retains the database source identity', async (contentType) => {
      respond(lead, contentType)
      const resolved = await getMetaLeadgen(id, 'test-token')
      expect(resolved).toEqual(lead)
      expect(normalizeMetaPayload(resolved!, 'page-1', 'client-1').source_lead_id).toBe(id)
    }
  )

  it.each([
    { field_data: lead.field_data },
    { ...lead, id: 'different-lead' },
    { ...lead, field_data: [] },
    { ...lead, field_data: 'wrong-shape' },
    { ...lead, field_data: [{ name: 'email', values: 'wrong-shape' }] },
    { data: [lead] },
    null
  ])('rejects invalid response %j before it reaches canonical intake', async (response) => {
    respond(response)
    await expect(getMetaLeadgen(id, 'test-token')).rejects.toThrow('Invalid Meta lead response')
  })

  it('retains the deleted-lead 404 result', async () => {
    mocks.fetch.mockImplementation(async () => new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } }))
    expect(await getMetaLeadgen(id, 'test-token')).toBeNull()
  })
})
