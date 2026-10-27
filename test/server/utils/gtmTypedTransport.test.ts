import { describe, it, expect, vi, beforeEach } from 'vitest'
const calls = vi.hoisted(() => ({ fetch: vi.fn(), quota: vi.fn() }))
vi.mock('ofetch', () => ({ ofetch: calls.fetch }))
vi.mock('../../../server/utils/googleTagManagerStore', () => ({
  reserveGtmApiQuota: calls.quota
}))
import {
  writeGtmEntity,
  listGtmEntities,
  getGtmVersion
} from '../../../server/utils/googleTagManagerClient'
describe('GTM typed REST adapter', () => {
  beforeEach(() => {
    calls.fetch.mockReset()
    calls.quota.mockReset()
  })
  it('uses PUT with mandatory fingerprint and never accepts a cross-workspace update', async () => {
    calls.fetch.mockResolvedValue({
      path: 'accounts/1/containers/2/workspaces/3/tags/4',
      fingerprint: 'next'
    })
    const body = {
      name: 'Google',
      type: 'googtag',
      parameter: [{ key: 'tagId', type: 'template', value: 'G-ABC' }],
      firingTriggerId: ['7']
    }
    await writeGtmEntity(
      'test',
      'accounts/1/containers/2/workspaces/3',
      'tags',
      body,
      {
        path: 'accounts/1/containers/2/workspaces/3/tags/4',
        fingerprint: 'expected'
      }
    )
    expect(calls.fetch).toHaveBeenCalledWith(
      'https://tagmanager.googleapis.com/tagmanager/v2/accounts/1/containers/2/workspaces/3/tags/4',
      expect.objectContaining({
        method: 'PUT',
        body,
        query: { fingerprint: 'expected' },
        retry: 0
      })
    )
    calls.fetch.mockClear()
    expect(() =>
      writeGtmEntity(
        'test',
        'accounts/1/containers/2/workspaces/3',
        'tags',
        body,
        {
          path: 'accounts/9/containers/2/workspaces/3/tags/4',
          fingerprint: 'x'
        }
      )
    ).toThrow()
    expect(calls.fetch).not.toHaveBeenCalled()
  })
  it('caps pagination and reserves each provider request', async () => {
    calls.fetch.mockResolvedValue({ tag: [], nextPageToken: 'again' })
    await expect(
      listGtmEntities('test', 'accounts/1/containers/2/workspaces/3', 'tags')
    ).rejects.toThrow('bounded page')
    expect(calls.fetch).toHaveBeenCalledTimes(5)
    expect(calls.quota).toHaveBeenCalledTimes(5)
  })
  it('uses exact version GET without a mutation body', async () => {
    calls.fetch.mockResolvedValue({
      path: 'accounts/1/containers/2/versions/4'
    })
    await getGtmVersion('test', 'accounts/1/containers/2/versions/4')
    expect(calls.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/versions/4'),
      expect.objectContaining({ method: 'GET', body: undefined })
    )
  })
})
