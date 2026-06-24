import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('$fetch', fetchMock) })

async function load() {
  const mod = await import('~~/app/composables/useSocialPlanner')
  return mod.useSocialPlanner()
}

describe('useSocialPlanner', () => {
  it('getBoard passes clientId + campaignId as query', async () => {
    fetchMock.mockResolvedValue([])
    await (await load()).getBoard('client-1', 'camp-9')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agency/social/publishing/board',
      { query: { clientId: 'client-1', campaignId: 'camp-9' } })
  })
  it('getBoard omits campaignId when not given', async () => {
    fetchMock.mockResolvedValue([])
    await (await load()).getBoard('client-1')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agency/social/publishing/board', { query: { clientId: 'client-1' } })
  })
  it('acceptDraft POSTs to /posts', async () => {
    fetchMock.mockResolvedValue({ id: 'p1' })
    await (await load()).acceptDraft({ clientId: 'c1', content: 'hi', status: 'draft' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agency/social/publishing/posts',
      { method: 'POST', body: { clientId: 'c1', content: 'hi', status: 'draft' } })
  })
  it('updateCampaign PATCHes the campaign id', async () => {
    fetchMock.mockResolvedValue({ id: 'camp-9' })
    await (await load()).updateCampaign('camp-9', { color: '#fff' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agency/social/publishing/campaigns/camp-9',
      { method: 'PATCH', body: { color: '#fff' } })
  })
})
