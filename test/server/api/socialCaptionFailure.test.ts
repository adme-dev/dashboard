import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: async () => ({ id: 'user-1' }) }))
vi.mock('~~/server/utils/ai/resolvedGroq', () => ({ generateModelRoutedGroqInsight: mocks.generate }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async () => ({ topic: 'Approved dealership introduction', platform: 'facebook' }))
const handler = (await import('~~/server/api/agency/social/publishing/ai/generate-caption.post')).default

beforeEach(() => vi.clearAllMocks())
describe('Compose AI caption response', () => {
  it.each(['', '  ', ' Unable to generate insight '])('rejects unusable output (%j) so existing post copy is preserved', async (caption) => {
    mocks.generate.mockResolvedValue(caption)
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 502 })
  })
  it('returns usable copy trimmed for review', async () => {
    mocks.generate.mockResolvedValue('  Your dealership. Connected.  ')
    await expect(handler({} as never)).resolves.toEqual({ caption: 'Your dealership. Connected.' })
  })
})
