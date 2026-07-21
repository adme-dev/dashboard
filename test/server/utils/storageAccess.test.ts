import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const {
  canDeleteStorageObject,
  requireStorageEntityAccess,
  resolveStorageUploadTarget,
  signStorageUploadCapability,
  storageUploadCapabilityMatches,
  verifyStorageUploadCapability
} = await import('~~/server/utils/storageAccess')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '33333333-3333-4333-8333-333333333333'
const EXPENSE_ID = '44444444-4444-4444-8444-444444444444'
const SECRET = 'test-storage-capability-secret-at-least-32-bytes'
const NOW = Date.UTC(2026, 6, 20, 12, 0, 0)

describe('storage access policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps only categories backed by an owned entity', () => {
    expect(resolveStorageUploadTarget('attachments')).toEqual({ entityType: 'task' })
    expect(resolveStorageUploadTarget('expenses')).toEqual({ entityType: 'expense' })
    expect(resolveStorageUploadTarget('avatars')).toEqual({ entityType: 'avatar' })
    expect(resolveStorageUploadTarget('general')).toBeNull()
    expect(resolveStorageUploadTarget('briefs')).toBeNull()
    expect(resolveStorageUploadTarget('invoices')).toBeNull()
  })

  it('requires task assignment or authorship before issuing an upload capability', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: TASK_ID })

    await expect(requireStorageEntityAccess({
      category: 'attachments',
      entityType: 'task',
      entityId: TASK_ID,
      actorId: USER_ID
    })).resolves.toBeUndefined()

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringMatching(/FROM tasks[\s\S]*(assignee_id|reporter_id)/),
      [TASK_ID, USER_ID]
    )
  })

  it('rejects an expense that does not belong to the actor', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(requireStorageEntityAccess({
      category: 'expenses',
      entityType: 'expense',
      entityId: EXPENSE_ID,
      actorId: USER_ID
    })).rejects.toMatchObject({ statusCode: 403 })

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringMatching(/FROM expenses[\s\S]*user_id/),
      [EXPENSE_ID, USER_ID]
    )
  })

  it('rejects mismatched category and entity types before querying', async () => {
    await expect(requireStorageEntityAccess({
      category: 'expenses',
      entityType: 'task',
      entityId: TASK_ID,
      actorId: USER_ID
    })).rejects.toMatchObject({ statusCode: 400 })

    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('allows an actor to target only their own avatar', async () => {
    await expect(requireStorageEntityAccess({
      category: 'avatars',
      entityType: 'avatar',
      entityId: USER_ID,
      actorId: USER_ID
    })).resolves.toBeUndefined()

    await expect(requireStorageEntityAccess({
      category: 'avatars',
      entityType: 'avatar',
      entityId: OTHER_USER_ID,
      actorId: USER_ID
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('denies deletion for unknown storage prefixes', async () => {
    await expect(canDeleteStorageObject('general/another-user/file.pdf', USER_ID)).resolves.toBe(false)
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('uses the canonical expense owner column for receipt deletion', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: EXPENSE_ID })

    await expect(canDeleteStorageObject(`expenses/${EXPENSE_ID}/receipt.pdf`, USER_ID)).resolves.toBe(true)
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringMatching(/FROM expenses[\s\S]*user_id/),
      [`expenses/${EXPENSE_ID}/receipt.pdf`, USER_ID]
    )
  })
})

describe('storage upload capability', () => {
  const capabilityInput = {
    actorId: USER_ID,
    key: `attachments/${TASK_ID}/${USER_ID}/file.pdf`,
    category: 'attachments' as const,
    entityType: 'task' as const,
    entityId: TASK_ID,
    fileType: 'application/pdf',
    fileSize: 4096
  }

  it('round-trips an actor-bound, expiring upload capability', async () => {
    const token = await signStorageUploadCapability(capabilityInput, SECRET, { now: NOW, ttlSeconds: 900 })

    await expect(verifyStorageUploadCapability(token, SECRET, { actorId: USER_ID, now: NOW + 60_000 }))
      .resolves.toMatchObject(capabilityInput)
  })

  it('rejects tampering, actor substitution, and expiry', async () => {
    const token = await signStorageUploadCapability(capabilityInput, SECRET, { now: NOW, ttlSeconds: 60 })
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`

    await expect(verifyStorageUploadCapability(tampered, SECRET, { actorId: USER_ID, now: NOW }))
      .resolves.toBeNull()
    await expect(verifyStorageUploadCapability(token, SECRET, { actorId: OTHER_USER_ID, now: NOW }))
      .resolves.toBeNull()
    await expect(verifyStorageUploadCapability(token, SECRET, { actorId: USER_ID, now: NOW + 60_000 }))
      .resolves.toBeNull()
    await expect(verifyStorageUploadCapability(token, SECRET, { actorId: USER_ID, now: NOW + 61_000 }))
      .resolves.toBeNull()
  })

  it('rejects key substitution and mismatched object metadata', async () => {
    const token = await signStorageUploadCapability(capabilityInput, SECRET, { now: NOW })
    const capability = await verifyStorageUploadCapability(token, SECRET, { actorId: USER_ID, now: NOW })

    expect(storageUploadCapabilityMatches(capability, {
      ...capabilityInput,
      key: 'attachments/another-task/stolen.pdf'
    })).toBe(false)
    expect(storageUploadCapabilityMatches(capability, {
      ...capabilityInput,
      fileSize: 4097
    })).toBe(false)
    expect(storageUploadCapabilityMatches(capability, capabilityInput)).toBe(true)
  })
})
