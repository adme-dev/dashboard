import { afterEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('getHeader', (event: any, name: string) => event.headers?.[name.toLowerCase()] ?? event.headers?.[name])
vi.stubGlobal('createError', (input: any) => Object.assign(new Error(input.statusMessage), input))

describe('requirePlatformAgentServiceAuth', () => {
  const oldKey = process.env.INTERNAL_API_KEY

  afterEach(() => {
    if (oldKey == null) delete process.env.INTERNAL_API_KEY
    else process.env.INTERNAL_API_KEY = oldKey
  })

  it.each([
    ['missing header', undefined],
    ['malformed header', 'Basic secret-key'],
    ['wrong secret', 'Bearer wrong-key'],
  ])('rejects %s', async (_label, authorization) => {
    process.env.INTERNAL_API_KEY = 'secret-key'
    const { requirePlatformAgentServiceAuth } = await import('~~/server/utils/ai/platformAgentServiceAuth')

    await expect(requirePlatformAgentServiceAuth({ headers: { authorization } } as any))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects when the server secret is not configured', async () => {
    delete process.env.INTERNAL_API_KEY
    const { requirePlatformAgentServiceAuth } = await import('~~/server/utils/ai/platformAgentServiceAuth')

    await expect(requirePlatformAgentServiceAuth({
      headers: { authorization: 'Bearer secret-key' },
    } as any)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('accepts the exact bearer secret', async () => {
    process.env.INTERNAL_API_KEY = 'secret-key'
    const { requirePlatformAgentServiceAuth } = await import('~~/server/utils/ai/platformAgentServiceAuth')

    await expect(requirePlatformAgentServiceAuth({
      headers: { authorization: 'Bearer secret-key' },
    } as any)).resolves.toBeUndefined()
  })
})
