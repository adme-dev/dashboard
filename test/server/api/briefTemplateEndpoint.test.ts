import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ queryOne: vi.fn(), queryRows: vi.fn() }))
vi.mock('~~/server/utils/db', () => mocks)
Object.assign(globalThis, {
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: (event: { params: Record<string, string> }, key: string) => event.params[key],
  createError: (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options)
})
const { default: handler } = await import('../../../server/api/agency/briefs/templates/[slug].get')

describe('GET brief template with fields', () => {
  beforeEach(() => {
    mocks.queryOne.mockReset().mockResolvedValue({ id: 'template-1', name: 'Social Media Content', slug: 'social-content' })
    mocks.queryRows.mockReset().mockResolvedValue([{ id: 'field-1', field_key: 'client', field_type: 'client' }])
  })
  it.each(['slug', 'id'])('accepts the %s route parameter and returns template fields', async (param) => {
    // Nitro shares this path with [id] PUT/DELETE and nested mapping routes.
    const result = await handler({ params: { [param]: 'social-content' } } as never)
    expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining('bt.slug = $1'), ['social-content'])
    expect(result).toMatchObject({ id: 'template-1', fields: [{ fieldKey: 'client', fieldType: 'client' }] })
  })
  it('still rejects a request without a template identifier', async () => {
    await expect(handler({ params: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.queryOne).not.toHaveBeenCalled()
  })
})
