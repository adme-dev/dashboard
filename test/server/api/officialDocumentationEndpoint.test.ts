import { describe, expect, it, vi } from 'vitest'
import { createDocumentationReadHandler } from '~~/server/api/agency/ai/documentation/read.post'
import type { User } from '~~/server/utils/auth'

const user: User = { id: 'staff', role: 'media_buyer', name: 'Fixture', email: 'fixture@example.test', is_active: true }
const url = 'https://developers.google.com/google-ads/api/docs/get-started/introduction'
function setup(body: unknown = { url }) {
  const deps = { auth: vi.fn(async () => user), readBody: vi.fn(async () => body), limit: vi.fn(), header: vi.fn(), read: vi.fn() }
  return { deps, handler: createDocumentationReadHandler(deps) }
}
describe('authenticated official documentation endpoint', () => {
  it('authenticates and limits the actual actor and returns private bounded reference metadata', async () => {
    const { deps, handler } = setup()
    deps.read.mockResolvedValue({ status: 'readable', excerpt: 'Reference', contentDigest: 'digest' })
    await expect(handler({} as Parameters<typeof handler>[0])).resolves.toMatchObject({ status: 'readable' })
    expect(deps.limit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: 'official-docs:staff', limit: 20, failureMode: 'closed' }))
    expect(deps.header).toHaveBeenCalledWith(expect.anything(), 'Cache-Control', 'private, no-store')
    expect(deps.read).toHaveBeenCalledWith(url)
  })
  it('denies unauthenticated or blocked URL requests before any provider fetch', async () => {
    const a = setup()
    a.deps.auth.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect(a.handler({} as Parameters<typeof a.handler>[0])).rejects.toMatchObject({ statusCode: 401 })
    expect(a.deps.read).not.toHaveBeenCalled()
    const b = setup({ url: 'http://localhost/private' })
    await expect(b.handler({} as Parameters<typeof b.handler>[0])).rejects.toMatchObject({ statusCode: 400 })
    expect(b.deps.limit).not.toHaveBeenCalled()
    expect(b.deps.read).not.toHaveBeenCalled()
  })
})
