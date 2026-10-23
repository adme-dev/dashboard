import { describe, expect, it, vi } from 'vitest'
import { getBrandKit, getDefaultBrandKitForClient } from '~~/server/utils/banner/brandKits'

const db = vi.hoisted(() => ({ queryOneFresh: vi.fn(), queryRowsFresh: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({
  ...db, transaction: vi.fn(),
  queryOne: () => { throw new Error('Cached guide') },
  queryRows: () => { throw new Error('Cached guide') }
}))
describe('Banner shared guide reads', () => {
  it('shows updated guide content on the next request for explicit and default kits', async () => {
    const kit = { colors: [], fonts: [], logos: [], guidelines: 'Original' }
    db.queryOneFresh.mockResolvedValueOnce(kit).mockResolvedValueOnce({ ...kit, guidelines: 'Updated' })
    expect((await getBrandKit('kit'))?.guidelines).toBe('Original')
    expect((await getBrandKit('kit'))?.guidelines).toBe('Updated')
    db.queryRowsFresh.mockResolvedValue([{ ...kit, guidelines: 'Updated' }])
    expect((await getDefaultBrandKitForClient('client'))?.guidelines).toBe('Updated')
  })
})
