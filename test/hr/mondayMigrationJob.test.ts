import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  executeMock,
  queryOneMock,
  createMondayClientMock,
  resolveMondayConnectionMock,
  migrateMock,
  reconcileMock,
  refreshMock
} = vi.hoisted(() => ({
  executeMock: vi.fn(),
  queryOneMock: vi.fn(),
  createMondayClientMock: vi.fn(),
  resolveMondayConnectionMock: vi.fn(),
  migrateMock: vi.fn(),
  reconcileMock: vi.fn(),
  refreshMock: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({ execute: executeMock, queryOne: queryOneMock }))
vi.mock('~~/server/utils/mondayClient', () => ({ createMondayClient: createMondayClientMock }))
vi.mock('~~/server/utils/mondayConnection', () => ({ resolveMondayConnection: resolveMondayConnectionMock }))
vi.mock('~~/server/utils/mondayMigration', () => ({
  MondayMigrationService: vi.fn().mockImplementation(function (this: any) { this.migrate = migrateMock })
}))
vi.mock('~~/server/utils/hr/mondaySyncReconcile', () => ({ reconcileMondaySyncSession: reconcileMock }))
vi.mock('~~/server/utils/hr/mondayEvidenceExtract', () => ({ refreshMondayEvidenceExtracts: refreshMock }))

import { runHrMondayMigration } from '../../server/utils/hr/mondayMigrationJob'

const event = { context: {} } as any
const scope = { id: 'scope1', board_ids: ['b1', 'b2'] }
const payload = { sessionId: 'sess1', scopeId: 'scope1', trigger: 'manual', config: {} as any }

beforeEach(() => {
  vi.clearAllMocks()
  queryOneMock.mockResolvedValue(scope)
  resolveMondayConnectionMock.mockResolvedValue({ accessToken: 'tok', accountId: 'acc', accountName: 'Acme' })
  createMondayClientMock.mockResolvedValue({})
  reconcileMock.mockResolvedValue(undefined)
  refreshMock.mockResolvedValue(undefined)
  executeMock.mockResolvedValue(undefined)
})

describe('runHrMondayMigration', () => {
  it('success path calls reconcile and refresh', async () => {
    migrateMock.mockResolvedValue(undefined)
    await runHrMondayMigration(event, payload)
    expect(reconcileMock).toHaveBeenCalledWith('scope1', ['b1', 'b2'], 'sess1')
    expect(refreshMock).toHaveBeenCalledWith(scope)
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('failure path writes status=failed and best-effort reconciles', async () => {
    migrateMock.mockRejectedValue(new Error('boom'))
    await runHrMondayMigration(event, payload)
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed'"),
      ['boom', 'scope1']
    )
    expect(reconcileMock).toHaveBeenCalledWith('scope1', ['b1', 'b2'], 'sess1')
    expect(refreshMock).toHaveBeenCalledWith(scope)
  })

  it('returns early without throwing if the scope no longer exists', async () => {
    queryOneMock.mockResolvedValue(null)
    await expect(runHrMondayMigration(event, payload)).resolves.toBeUndefined()
    expect(createMondayClientMock).not.toHaveBeenCalled()
  })
})
