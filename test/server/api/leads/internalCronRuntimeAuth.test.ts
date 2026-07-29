import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getHeader: (event: { authorization?: string }, name: string) => string | undefined
  getQuery: () => Record<string, unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error
}
globals.defineEventHandler = handler => handler
globals.getHeader = event => event.authorization
globals.getQuery = () => ({})
globals.createError = input => Object.assign(new Error(input.statusMessage), input)

const mocks = vi.hoisted(() => ({
  recoverStuckClaims: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  upsertFormMetadata: vi.fn(),
  acceptLead: vi.fn(),
  normalizeMetaPayload: vi.fn(),
  getMetaLeadgen: vi.fn(),
  resolveAssignedAm: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne,
  queryRows: mocks.queryRows,
  execute: mocks.execute
}))
vi.mock('~~/server/utils/leads/db', async () => ({
  recoverStuckClaims: mocks.recoverStuckClaims,
  upsertFormMetadata: mocks.upsertFormMetadata
}))
vi.mock('~~/server/utils/leads/acceptance', () => ({
  acceptLead: mocks.acceptLead
}))
vi.mock('~~/server/utils/leads/normalizer', () => ({
  normalizeMetaPayload: mocks.normalizeMetaPayload
}))
vi.mock('~~/server/utils/metaClient', () => ({
  getMetaLeadgen: mocks.getMetaLeadgen
}))
vi.mock('~~/server/utils/leads/autoAssign', () => ({
  resolveAssignedAm: mocks.resolveAssignedAm
}))

const { default: recoverStuckClaims } = await import(
  '../../../../server/api/leads/_internal/recover-stuck-claims.post'
)
const { default: purgeRetention } = await import(
  '../../../../server/api/leads/_internal/purge-retention.post'
)
const { default: metaBackfill } = await import(
  '../../../../server/api/leads/_internal/meta-backfill.post'
)

describe('legacy leads cron runtime authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_CRON_TOKEN = 'stale-process-token'
    mocks.recoverStuckClaims.mockResolvedValue(4)
    mocks.queryOne.mockResolvedValue({ n: '3' })
    mocks.queryRows.mockResolvedValue([])
    mocks.execute.mockResolvedValue(3)
  })

  afterEach(() => {
    delete process.env.INTERNAL_CRON_TOKEN
    delete process.env.LEADS_RETENTION_MONTHS
  })

  it('uses the Cloudflare runtime token for stuck-claim recovery ahead of process.env', async () => {
    await expect(recoverStuckClaims({
      authorization: 'Bearer runtime-cron-token',
      context: { cloudflare: { env: { INTERNAL_CRON_TOKEN: 'runtime-cron-token' } } }
    } as never)).resolves.toEqual({ reset: 4 })

    expect(mocks.recoverStuckClaims).toHaveBeenCalledWith(5)
  })

  it('uses the Cloudflare runtime token for retention purge ahead of process.env', async () => {
    await expect(purgeRetention({
      authorization: 'Bearer runtime-cron-token',
      context: { cloudflare: { env: { INTERNAL_CRON_TOKEN: 'runtime-cron-token' } } }
    } as never)).resolves.toEqual({
      ok: true,
      candidate_count: 3,
      deleted: 3,
      months: 18
    })

    expect(mocks.queryOne).toHaveBeenCalledOnce()
    expect(mocks.execute).toHaveBeenCalledOnce()
  })

  it('uses the Cloudflare runtime token for Meta backfill ahead of process.env', async () => {
    await expect(metaBackfill({
      authorization: 'Bearer runtime-cron-token',
      context: { cloudflare: { env: { INTERNAL_CRON_TOKEN: 'runtime-cron-token' } } }
    } as never)).resolves.toEqual({
      scanned: 0,
      ingested: 0,
      duplicates: 0,
      still_pending: 0,
      errors: 0,
      details: []
    })

    expect(mocks.queryRows).toHaveBeenCalledOnce()
  })

  it('uses the bounded Cloudflare retention period ahead of process.env', async () => {
    process.env.LEADS_RETENTION_MONTHS = '30'

    await expect(purgeRetention({
      authorization: 'Bearer runtime-cron-token',
      context: {
        cloudflare: {
          env: {
            INTERNAL_CRON_TOKEN: 'runtime-cron-token',
            LEADS_RETENTION_MONTHS: '6'
          }
        }
      }
    } as never)).resolves.toMatchObject({ ok: true, months: 6 })

    expect(mocks.queryOne).toHaveBeenCalledWith(expect.any(String), ['6'])
    expect(mocks.execute).toHaveBeenCalledWith(expect.any(String), ['6'])
  })

  it('rejects an out-of-range Cloudflare retention period before querying', async () => {
    await expect(purgeRetention({
      authorization: 'Bearer runtime-cron-token',
      context: {
        cloudflare: {
          env: {
            INTERNAL_CRON_TOKEN: 'runtime-cron-token',
            LEADS_RETENTION_MONTHS: '121'
          }
        }
      }
    } as never)).resolves.toEqual({ ok: false, error: 'invalid_LEADS_RETENTION_MONTHS' })

    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('rejects the stale process token when a distinct Cloudflare token is configured', async () => {
    await expect(recoverStuckClaims({
      authorization: 'Bearer stale-process-token',
      context: { cloudflare: { env: { INTERNAL_CRON_TOKEN: 'runtime-cron-token' } } }
    } as never)).rejects.toMatchObject({ statusCode: 401 })

    expect(mocks.recoverStuckClaims).not.toHaveBeenCalled()
  })

  it('rejects the stale process token for Meta backfill when a runtime token is configured', async () => {
    await expect(metaBackfill({
      authorization: 'Bearer stale-process-token',
      context: { cloudflare: { env: { INTERNAL_CRON_TOKEN: 'runtime-cron-token' } } }
    } as never)).rejects.toMatchObject({ statusCode: 401 })

    expect(mocks.queryRows).not.toHaveBeenCalled()
  })
})
