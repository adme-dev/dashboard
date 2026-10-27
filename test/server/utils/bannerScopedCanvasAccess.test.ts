import { beforeEach, describe, expect, it, vi } from 'vitest'
const tx = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: tx.run }))
import { assertScopedCanvasAccess, withScopedCanvasAccess, assertScopedCanvasLineage } from '../../../server/utils/banner/scopedCanvasAccess'
import { scopedDissectionAssetKey, scopedDissectionAssetLocator } from '../../../shared/bannerDissectionDelivery'

const actor = '11111111-1111-4111-8111-111111111111'
const client = '22222222-2222-4222-8222-222222222222'
const project = '33333333-3333-4333-8333-333333333333'
const job = '44444444-4444-4444-8444-444444444444'
const asset = '55555555-5555-4555-8555-555555555555'
const attempt = '66666666-6666-4666-8666-666666666666'
const second = '77777777-7777-4777-8777-777777777777'
const source = { version: 1, mimeType: 'image/png', byteLength: 10, sha256: 'a'.repeat(64), width: 1, height: 1 }
const marker = { jobId: job, sourceSha256: source.sha256 }
const canvas = () => ({ square: { dissectionSource: marker, layers: [{ type: 'image', src: scopedDissectionAssetLocator(job, asset) }] } })
function fixture() {
  const entry = { assetId: asset, attemptId: attempt, key: scopedDissectionAssetKey(job, attempt, asset), mimeType: 'image/png', byteLength: 10, sha256: 'b'.repeat(64) }
  const state = {
    active: true, assigned: true, permissions: ['CREATIVE'], role: true, session: null as string | null,
    targetClient: client as string | null,
    row: { job_id: job, user_id: actor, manifest: { source, ingestion: { version: 1, owner: { kind: 'project', userId: actor, projectId: project, projectOwnerId: actor, clientId: client as string | null }, physical: null, ingestedAt: '2026-10-27T12:00:00.000Z', sessionsInvalidatedAt: null }, delivery: { version: 1, assets: { [asset]: entry } } } },
    assetRow: { id: asset, r2_key: entry.key, uploaded_by: actor, client_id: client as string | null, mime_type: entry.mimeType, file_size: entry.byteLength, url: scopedDissectionAssetLocator(job, asset) },
    calls: [] as { sql: string, params: unknown[] }[],
  }
  const db = { async query(sql: string, params: unknown[] = []) {
    state.calls.push({ sql, params })
    if (sql.includes('FROM banner_dissections')) return { rows: [{ ...state.row, job_id: params[0] }] }
    if (sql.includes('FROM team_members')) return { rows: [{ id: actor, user_role: 'creative', custom_role_id: null, is_active: state.active, sessions_invalidated_at: state.session }] }
    if (sql.includes('FROM custom_roles')) return { rows: state.role ? [{ id: 'role', is_read_only: false }] : [] }
    if (sql.includes('FROM role_permission_groups')) return { rows: state.permissions.map(permission_group => ({ permission_group })) }
    if (sql.includes('FROM banner_projects')) return { rows: [{ id: params[0], client_id: state.targetClient, created_by: actor }] }
    if (sql.includes('FROM agency_clients')) return { rows: [{ id: client }] }
    if (sql.includes('FROM client_team_assignments')) return { rows: state.assigned ? [{ id: 'assignment' }] : [] }
    if (sql.includes('FROM banner_assets')) return { rows: [state.assetRow] }
    throw new Error('unexpected SQL')
  } }
  tx.run.mockImplementation((fn: any) => fn(db))
  return state
}
beforeEach(() => vi.resetAllMocks())
describe('fresh scoped canvas authority', () => {
  it('leaves legacy and QR canvases on their existing policy', async () => {
    await assertScopedCanvasAccess(actor, { layers: [{ type: 'qr', src: '/api/public/banner-assets/token' }] }, project)
    expect(tx.run).not.toHaveBeenCalled()
  })
  it('authorizes canonical registered images and text-only protected source markers', async () => {
    fixture()
    await expect(assertScopedCanvasAccess(actor, canvas(), project)).resolves.toBeUndefined()
    await expect(assertScopedCanvasAccess(actor, { square: { dissectionSource: marker, layers: [{ text: 'Secret copy' }] } }, project)).resolves.toBeUndefined()
  })
  it.each(['active', 'assigned', 'role', 'permissions', 'session', 'uploader', 'sha', 'owner', 'registry', 'asset', 'target'])(
    'denies after fresh %s revocation or tampering before mutation', async change => {
      const state = fixture()
      await assertScopedCanvasAccess(actor, canvas(), project)
      if (change === 'active') state.active = false
      if (change === 'assigned') state.assigned = false
      if (change === 'role') state.role = false
      if (change === 'permissions') state.permissions = []
      if (change === 'session') state.session = '2026-10-28T00:00:00.000Z'
      if (change === 'uploader') state.row.user_id = second
      if (change === 'sha') state.row.manifest.source = { ...source, sha256: 'c'.repeat(64) }
      if (change === 'owner') delete (state.row.manifest as any).ingestion
      if (change === 'registry') delete (state.row.manifest.delivery.assets as any)[asset]
      if (change === 'asset') state.assetRow.r2_key = 'banner-assets/public.png'
      if (change === 'target') state.targetClient = second
      let mutated = false
      await expect(withScopedCanvasAccess(actor, canvas(), project, 'write', async () => { mutated = true })).rejects.toMatchObject({ statusCode: 403 })
      expect(mutated).toBe(false)
    })
  it('supports scoped personal-project ownership with null client', async () => {
    const state = fixture()
    state.row.manifest.ingestion.owner.clientId = null
    state.assetRow.client_id = null
    state.targetClient = null
    await expect(assertScopedCanvasAccess(actor, canvas(), project)).resolves.toBeUndefined()
  })
  it('locks all sources sorted before locking actor/project authority', async () => {
    const state = fixture()
    await assertScopedCanvasAccess(actor, { b: { dissectionSource: { ...marker, jobId: second } }, a: { dissectionSource: marker } }, project)
    expect(state.calls.slice(0, 2).map(x => x.params[0])).toEqual([job, second])
    expect(state.calls.slice(0, 2).every(x => x.sql.includes('FOR UPDATE'))).toBe(true)
  })
  it('rejects encoded and absolute protected locator aliases', async () => {
    fixture()
    for (const src of ['https://example.com' + scopedDissectionAssetLocator(job, asset), encodeURIComponent(scopedDissectionAssetLocator(job, asset))]) {
      await expect(assertScopedCanvasAccess(actor, { src }, project)).rejects.toMatchObject({ statusCode: 403 })
    }
  })
  it('rejects stripping lineage from a managed snapshot', () => {
    expect(() => assertScopedCanvasLineage(canvas(), {})).toThrow(/Keep the protected source/)
    try { assertScopedCanvasLineage(canvas(), {}) } catch (error: any) { expect(error.statusCode).toBe(409) }
    expect(() => assertScopedCanvasLineage(canvas(), canvas())).not.toThrow()
  })
  it('denies a new public/personal copy of client-scoped content', async () => {
    fixture()
    let mutated = false
    await expect(withScopedCanvasAccess(actor, canvas(), undefined, 'write', async () => { mutated = true }, { clientId: null })).rejects.toMatchObject({ statusCode: 403 })
    expect(mutated).toBe(false)
  })
})
