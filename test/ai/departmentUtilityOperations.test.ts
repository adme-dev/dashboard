/* eslint-disable @typescript-eslint/no-explicit-any -- Mock transport and database fixture shapes are intentionally partial. */
import { beforeEach, expect, it, vi } from 'vitest'
import { executeDepartmentUtilityOperation } from '~~/server/utils/ai/marketing/departmentUtilityOperations'

const m = vi.hoisted(() => ({ authority: vi.fn(), scope: vi.fn(), rows: vi.fn(), query: vi.fn(), claim: vi.fn(), finish: vi.fn() }))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: m.authority }))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({ resolveMarketingReadScope: async () => ({}), requireScopedClient: m.scope }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: m.rows, transaction: async (fn: any) => fn({ query: m.query }) }))
vi.mock('~~/server/utils/ai/marketing/departmentExecutionLedger', async original => ({ ...await original<any>(), claimExecution: m.claim, finishExecution: m.finish }))
const clientId = '11111111-1111-4111-8111-111111111111', qrId = '22222222-2222-4222-8222-222222222222'
const ctx = { userId: '33333333-3333-4333-8333-333333333333', event: {}, permissionGroups: ['QR_CODES', 'MARKETING_MANAGEMENT'] } as any
const key = `mcp:${'a'.repeat(64)}`, digest = 'b'.repeat(64)
beforeEach(() => {
  vi.clearAllMocks()

  m.authority.mockResolvedValue(ctx)

  m.scope.mockResolvedValue(undefined)

  m.rows.mockResolvedValue([])

  m.claim.mockResolvedValue({ kind: 'fresh' })

  m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('INSERT INTO qr_codes') ? [{ id: qrId, code: 'AbCdEfG' }] : sql.includes('agency_clients') ? [{ id: clientId }] : [], rowCount: 1 }))
})
it('minimizes lead reporting and excludes inactive, deleted and test leads before pagination', async () => {
  expect(await executeDepartmentUtilityOperation('marketing_list_lead_followups', { clientId }, ctx, key, digest)).toMatchObject({ ok: true, data: { items: [], nextCursor: null } })

  const sql = m.rows.mock.calls[0]?.[0] as string

  expect(sql).toContain('is_active = TRUE')

  expect(sql).toContain('l.is_test = FALSE')

  expect(sql).toContain('l.deleted_at IS NULL')

  expect(sql).toContain('l.client_id = $1')

  expect(sql).not.toMatch(/l\.\*|field_data|notes|email|phone/)
})
it('denies revoked or foreign client scope before stored reads or mutation', async () => {
  m.scope.mockRejectedValue(new Error('forbidden'))

  expect(await executeDepartmentUtilityOperation('marketing_list_qr_codes', { clientId }, ctx, key, digest)).toMatchObject({ ok: false })

  expect(m.rows).not.toHaveBeenCalled()

  expect(m.query).not.toHaveBeenCalled()
})
it('validates campaign destinations without fetching them and preserves existing query parameters', async () => {
  expect(await executeDepartmentUtilityOperation('marketing_build_campaign_url', { clientId, url: 'https://example.com/offer?stock=123', source: 'facebook', medium: 'paid_social', campaign: 'Spring launch' }, ctx, key, digest)).toMatchObject({ ok: true, data: { url: 'https://example.com/offer?stock=123&utm_source=facebook&utm_medium=paid_social&utm_campaign=Spring+launch' } })

  expect(await executeDepartmentUtilityOperation('marketing_build_campaign_url', { clientId, url: 'http://127.0.0.1/', source: 'facebook', medium: 'paid_social', campaign: 'Spring' }, ctx, key, digest)).toMatchObject({ ok: false })

  expect(m.query).not.toHaveBeenCalled()
})
it('creates a QR and its destination history in the same claimed transaction, without dispatching it', async () => {
  expect(await executeDepartmentUtilityOperation('marketing_create_qr_code', { clientId, name: 'Spring', destinationUrl: 'https://example.com/offer', ack: true }, ctx, key, digest)).toMatchObject({ ok: true, data: { qrCodeId: qrId, shortUrl: 'https://app.xeroflow.io/q/AbCdEfG', distributed: false } })

  expect(m.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO qr_destination_history'))).toBe(true)

  expect(m.finish).toHaveBeenCalled()
})
it('never creates a second QR on a successful replay and refuses invalid execution identities', async () => {
  m.claim.mockResolvedValue({ kind: 'replay', result: { qrCodeId: qrId } })

  expect(await executeDepartmentUtilityOperation('marketing_create_qr_code', { clientId, name: 'Spring', destinationUrl: 'https://example.com', ack: true }, ctx, key, digest)).toMatchObject({ ok: true, data: { qrCodeId: qrId, replayed: true } })

  expect(m.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO qr_codes'))).toBe(false)

  expect(await executeDepartmentUtilityOperation('marketing_create_qr_code', { clientId, name: 'Spring', destinationUrl: 'https://example.com', ack: true }, ctx, 'untrusted', digest)).toMatchObject({ ok: false })
})
it('distinguishes an existing QR with no scans from an unavailable or foreign QR without exposing visitor records', async () => {
  m.rows.mockResolvedValueOnce([])

  expect(await executeDepartmentUtilityOperation('marketing_get_qr_metrics', { clientId, qrCodeId: qrId, days: 30 }, ctx, key, digest)).toMatchObject({ ok: false, code: 'not_found' })

  m.rows.mockResolvedValueOnce([{ day: null, scans: 0, unique_devices: 0 }])

  expect(await executeDepartmentUtilityOperation('marketing_get_qr_metrics', { clientId, qrCodeId: qrId, days: 30 }, ctx, key, digest)).toMatchObject({ ok: true, data: { daily: [] } })

  const sql = m.rows.mock.calls[1]?.[0] as string

  expect(sql).toContain('LEFT JOIN qr_scans')

  expect(sql).toContain('q.client_id=$2')

  expect(sql).not.toMatch(/SELECT\s+s\.\*|s\.ip_address|s\.user_agent/)
})

it('exposes revision-bound KPI reads and refuses stale writes or duplicate targets', async () => {
  m.rows.mockImplementation(async (sql: string) => sql.includes('SELECT id FROM agency_clients') ? [{ id: clientId }] : [])
  const read = await executeDepartmentUtilityOperation('marketing_get_client_kpi_targets', { clientId }, ctx, key, digest)
  expect(read).toMatchObject({ ok: true, data: { targets: [], availableResultTypes: [], storedOnly: true } })
  const targets = [{ resultType: 'lead', targetCostPerResult: 20 }]
  expect(await executeDepartmentUtilityOperation('marketing_set_client_kpi_targets', { clientId, targets, expectedRevision: '0'.repeat(64), ack: true }, ctx, key, digest)).toMatchObject({ ok: false, code: 'conflict' })
  expect(m.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false)
  expect(await executeDepartmentUtilityOperation('marketing_set_client_kpi_targets', { clientId, targets: [...targets, ...targets], expectedRevision: '0'.repeat(64), ack: true }, ctx, key, digest)).toMatchObject({ ok: false, code: 'bad_args' })
})
it('replays KPI receipts without rewriting stored targets and revalidates authority before the claim', async () => {
  const targets = [{ resultType: 'lead', targetCostPerResult: 20 }]
  const input = { clientId, targets, expectedRevision: '0'.repeat(64), ack: true }
  m.claim.mockResolvedValue({ kind: 'replay', result: { count: 1 } })
  expect(await executeDepartmentUtilityOperation('marketing_set_client_kpi_targets', input, ctx, key, digest)).toMatchObject({ ok: true, data: { count: 1, replayed: true } })
  expect(m.query).not.toHaveBeenCalled()
  m.authority.mockReset().mockResolvedValueOnce(ctx).mockRejectedValueOnce(new Error('revoked'))
  m.claim.mockClear()
  expect(await executeDepartmentUtilityOperation('marketing_set_client_kpi_targets', input, ctx, key, digest)).toMatchObject({ ok: false })
  expect(m.claim).not.toHaveBeenCalled()
})
