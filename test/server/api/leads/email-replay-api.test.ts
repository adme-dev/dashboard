import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSIONS } from '../../../../server/utils/permissions'

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRouterParam: (event: { id?: string }, name: string) => string | undefined
}
globals.defineEventHandler = handler => handler
globals.getRouterParam = event => event.id

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  replayEmailIngestion: vi.fn(),
  runtime: vi.fn()
}))

vi.mock('~~/server/utils/auth', () => ({
  requireRole: mocks.requireRole
}))
vi.mock('~~/server/utils/leads/emailRecovery', () => ({
  replayEmailIngestion: mocks.replayEmailIngestion,
  resolveEmailRecoveryRuntime: mocks.runtime
}))

const { default: handler } = await import(
  '../../../../server/api/leads/email-ingestions/[id]/replay.post'
)

describe('POST /api/leads/email-ingestions/:id/replay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111'
    })
    mocks.runtime.mockReturnValue({ bucket: {}, encryptionSecret: 'secret' })
    mocks.replayEmailIngestion.mockResolvedValue({ status: 'accepted' })
  })

  it('requires owner/admin and records the authenticated actor at replay', async () => {
    const event = {
      id: '22222222-2222-4222-8222-222222222222',
      context: {}
    }

    await expect(handler(event as never)).resolves.toEqual({
      ok: true,
      status: 'accepted'
    })

    expect(mocks.requireRole).toHaveBeenCalledWith(event, PERMISSIONS.ADMIN)
    expect(mocks.replayEmailIngestion).toHaveBeenCalledWith(
      event,
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      expect.anything()
    )
  })

  it('rejects client-portal callers before replay', async () => {
    const event = {
      id: '22222222-2222-4222-8222-222222222222',
      context: { clientPortalUser: { id: 'portal-user' } }
    }

    await expect(handler(event as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden'
    })

    expect(mocks.replayEmailIngestion).not.toHaveBeenCalled()
  })
})
