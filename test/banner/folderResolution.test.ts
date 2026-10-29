import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: vi.fn() }))
import { queryOneFresh } from '../../server/utils/db'
import { resolveBannerFolderId } from '../../server/utils/banner/folders'
const id = '632a71d5-cd2c-4d9f-812d-e3f70bb6c241'
beforeEach(() => vi.clearAllMocks())
it('accepts no folder without a query and rejects invalid identities before querying', async () => {
  expect(await resolveBannerFolderId(undefined)).toBeNull()
  await expect(resolveBannerFolderId('bad')).rejects.toMatchObject({ statusCode: 400 })
  expect(queryOneFresh).not.toHaveBeenCalled()
})
it('requires a current folder and uses a bound identifier', async () => {
  vi.mocked(queryOneFresh).mockResolvedValueOnce(null)
  await expect(resolveBannerFolderId(id)).rejects.toMatchObject({ statusCode: 400 })
  vi.mocked(queryOneFresh).mockResolvedValueOnce({ id })
  expect(await resolveBannerFolderId(id)).toBe(id)
  expect(queryOneFresh).toHaveBeenLastCalledWith('SELECT id FROM banner_folders WHERE id = $1', [id])
})
