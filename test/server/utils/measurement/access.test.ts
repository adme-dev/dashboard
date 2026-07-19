import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequirePermission = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('h3', () => ({
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(
    new Error(input.statusMessage),
    input
  )
}))

describe('Measurement client access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({ id: 'staff-1', role: 'owner' })
    mockRequireWriteAccess.mockResolvedValue({ id: 'staff-1', role: 'owner' })
    mockQueryOne.mockResolvedValue(null)
  })

  it('allows management roles without an assignment lookup', async () => {
    const { requireMeasurementClientAccess } = await import(
      '../../../../server/utils/measurement/access'
    )

    await expect(requireMeasurementClientAccess(
      { context: {} } as never,
      '11111111-1111-4111-8111-111111111111',
      'view'
    )).resolves.toMatchObject({ role: 'owner' })

    expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), 'MEDIA_BUYING')
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('allows an assigned media operator and scopes the lookup by client and user', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'staff-1', role: 'media_buyer' })
    mockRequireWriteAccess.mockResolvedValue({ id: 'staff-1', role: 'media_buyer' })
    mockQueryOne.mockResolvedValue({ '?column?': 1 })
    const { requireMeasurementClientAccess } = await import(
      '../../../../server/utils/measurement/access'
    )

    await expect(requireMeasurementClientAccess(
      { context: {} } as never,
      '11111111-1111-4111-8111-111111111111',
      'configure'
    )).resolves.toMatchObject({ role: 'media_buyer' })

    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringMatching(/client_id = \$1/), [
      '11111111-1111-4111-8111-111111111111',
      'staff-1'
    ])
  })

  it('requires server-side write access for configuration but not read-only views', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'staff-1', role: 'owner' })
    mockRequireWriteAccess.mockRejectedValue(Object.assign(new Error('Read-only access'), {
      statusCode: 403,
      statusMessage: 'Forbidden - Read-only access'
    }))
    const { requireMeasurementClientAccess } = await import(
      '../../../../server/utils/measurement/access'
    )

    await expect(requireMeasurementClientAccess(
      { context: {} } as never,
      '11111111-1111-4111-8111-111111111111',
      'view'
    )).resolves.toMatchObject({ role: 'owner' })
    expect(mockRequireWriteAccess).not.toHaveBeenCalled()

    await expect(requireMeasurementClientAccess(
      { context: {} } as never,
      '11111111-1111-4111-8111-111111111111',
      'configure'
    )).rejects.toMatchObject({ statusCode: 403 })
    expect(mockRequireWriteAccess).toHaveBeenCalledWith(expect.anything())
  })

  it('hides an unassigned tenant profile behind the same not-found response', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'staff-1', role: 'account_manager' })
    const { requireMeasurementClientAccess } = await import(
      '../../../../server/utils/measurement/access'
    )

    await expect(requireMeasurementClientAccess(
      { context: {} } as never,
      '11111111-1111-4111-8111-111111111111',
      'view'
    )).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Measurement profile not found'
    })
  })

  it('rejects malformed client IDs before querying assignments', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'staff-1', role: 'media_buyer' })
    const { requireMeasurementClientAccess } = await import(
      '../../../../server/utils/measurement/access'
    )

    await expect(requireMeasurementClientAccess(
      { context: {} } as never,
      'not-a-client-id',
      'view'
    )).rejects.toMatchObject({ statusCode: 400 })

    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('fails closed for an unexpected measurement permission value', async () => {
    const { requireMeasurementClientAccess } = await import(
      '../../../../server/utils/measurement/access'
    )

    await expect(requireMeasurementClientAccess(
      { context: {} } as never,
      '11111111-1111-4111-8111-111111111111',
      'delete' as never
    )).rejects.toMatchObject({ statusCode: 400 })

    expect(mockRequireWriteAccess).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('restricts approval and activation actions to measurement management roles', async () => {
    mockRequirePermission.mockResolvedValue({ id: 'staff-1', role: 'media_buyer' })
    mockQueryOne.mockResolvedValue({ '?column?': 1 })
    const { requireMeasurementActivationAccess } = await import(
      '../../../../server/utils/measurement/access'
    )

    await expect(requireMeasurementActivationAccess(
      { context: {} } as never,
      '11111111-1111-4111-8111-111111111111'
    )).rejects.toMatchObject({ statusCode: 403 })

    mockRequirePermission.mockResolvedValue({ id: 'staff-2', role: 'admin' })
    await expect(requireMeasurementActivationAccess(
      { context: {} } as never,
      '11111111-1111-4111-8111-111111111111'
    )).resolves.toMatchObject({ role: 'admin' })
  })

  it('restricts a separation-of-duties override to the application owner', async () => {
    const { requireMeasurementOwnerOverrideAccess } = await import(
      '../../../../server/utils/measurement/access'
    )

    mockRequirePermission.mockResolvedValue({ id: 'staff-1', role: 'admin' })
    await expect(requireMeasurementOwnerOverrideAccess(
      { context: {} } as never,
      '11111111-1111-4111-8111-111111111111'
    )).rejects.toMatchObject({ statusCode: 403 })

    mockRequirePermission.mockResolvedValue({ id: 'staff-2', role: 'owner' })
    await expect(requireMeasurementOwnerOverrideAccess(
      { context: {} } as never,
      '11111111-1111-4111-8111-111111111111'
    )).resolves.toMatchObject({ id: 'staff-2', role: 'owner' })
  })
})
