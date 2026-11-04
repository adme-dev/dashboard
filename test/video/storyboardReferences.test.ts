import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pinReferencesIn, checkReferencesIn, storyboardFileMetadata } from '~~/server/utils/video-storyboard/references'
import { id } from './fixtures/storyboard'
import type { H3Event } from 'h3'
import type { ReferenceSetWrite } from '~~/shared/video/storyboardReferences'

const head = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/storage', async original => ({ ...await original<typeof import('~~/server/utils/storage')>(), getFileMetadata: head }))
const actor = { id: id(6), role: 'member' }
const project = { id: id(2), clientId: id(7), createdBy: actor.id }
const source = { id: id(20), client_id: id(7), created_by: actor.id, r2_key: 'canonical/source.png', status: 'approved', subject_type: 'vehicle', source_metadata: { vehicleId: 'exact-product' } }
const query = vi.fn()
const db = { query }
const deps = { event: { context: {} } as H3Event }
function bannerRows(row: Record<string, unknown>, groups = ['CREATIVE'], assigned = true) {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM team_members')) return { rows: [{ role: 'creative', custom_role_id: id(80) }] }
    if (sql.includes('FROM custom_roles')) return { rows: [{ permission_groups: groups, is_read_only: false }] }
    if (sql.includes('FROM client_team_assignments')) return { rows: assigned ? [{ client_id: project.clientId }] : [] }
    return { rows: [row] }
  })
}
const input: ReferenceSetWrite['references'][number] = { role: 'product', sourceKind: 'source_asset', assetId: id(20), expectedContentHash: null, decision: 'unreviewed', evidence: '' }
beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [source] })
  head.mockReset().mockResolvedValue({ etag: 'etag-a', size: 12, contentType: 'image/png' })
})
describe('canonical storyboard reference approval', () => {
  it('leaves generation-approved sources with unknown project usage rights', async () => {
    const pinned = await pinReferencesIn(db, project, actor, [input], null)
    expect(pinned.references[0].approval).toBeNull()
    const findings = await checkReferencesIn(db, project, actor, pinned)
    expect(findings.map((f: { code: string }) => f.code)).toContain('usage_approval_required')
  })
  it('records explicit project approval with server actor/time and leaves the source unchanged', async () => {
    const first = await pinReferencesIn(db, project, actor, [input], null)
    const approved = await pinReferencesIn(db, project, actor, [{ ...input, expectedContentHash: first.references[0].contentHash, decision: 'approved', evidence: 'Client permission recorded in brief' }], null)
    expect(approved.references[0].approval).toMatchObject({ actorId: actor.id, contentHash: first.references[0].contentHash })
    expect(await checkReferencesIn(db, project, actor, approved)).toEqual([])
    expect(query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true)
  })
  it('rejects wrong-client sources even for an owner', async () => {
    query.mockResolvedValue({ rows: [{ ...source, client_id: id(99) }] })
    await expect(pinReferencesIn(db, project, { ...actor, role: 'owner' }, [input], null)).rejects.toMatchObject({ statusCode: 403 })
    expect(head).not.toHaveBeenCalled()
  })
  it('detects replaced object bytes and revoked source approval', async () => {
    const pinned = await pinReferencesIn(db, project, actor, [input], null)
    head.mockResolvedValue({ etag: 'etag-b', size: 12, contentType: 'image/png' })
    expect((await checkReferencesIn(db, project, actor, pinned)).map((f: { code: string }) => f.code)).toContain('reference_changed')
    query.mockResolvedValue({ rows: [{ ...source, status: 'revoked' }] })
    expect((await checkReferencesIn(db, project, actor, pinned)).map((f: { code: string }) => f.code)).toContain('reference_unavailable')
  })
  it('does not approve changed content or a missing object', async () => {
    await expect(pinReferencesIn(db, project, actor, [{ ...input, decision: 'approved', expectedContentHash: 'a'.repeat(64), evidence: 'Reviewed' }], null)).rejects.toMatchObject({ statusCode: 409 })
    head.mockResolvedValue(null)
    await expect(pinReferencesIn(db, project, actor, [input], null)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('detects changed brand-kit content', async () => {
    bannerRows({ ...source, colors: ['#ffffff'], fonts: [], logos: [], guidelines: 'Original' })
    const pinned = await pinReferencesIn(db, project, actor, [], { id: id(20), expectedContentHash: null }, deps)
    bannerRows({ ...source, colors: ['#ffffff'], fonts: [], logos: [], guidelines: 'Revised' })
    expect((await checkReferencesIn(db, project, actor, pinned, deps)).map((f: { code: string }) => f.code)).toContain('brand_kit_changed')
  })
})

describe('current Banner authority on references', () => {
  it.each(['banner_project', 'brand_kit'] as const)('denies a former creator after client assignment revocation: %s', async (kind) => {
    bannerRows(source, ['CREATIVE'], false)
    const { canonicalReferenceIn } = await import('~~/server/utils/video-storyboard/references')
    await expect(canonicalReferenceIn(db, project, actor, kind, source.id, deps)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['banner_project', 'brand_kit'] as const)('allows a currently assigned colleague: %s', async (kind) => {
    bannerRows({ ...source, created_by: id(99) })
    const { canonicalReferenceIn } = await import('~~/server/utils/video-storyboard/references')
    await expect(canonicalReferenceIn(db, project, actor, kind, source.id, deps)).resolves.toMatchObject({ identityKind: 'record' })
  })
  it('allows a shared kit for creative staff and rechecks revoked creative permission', async () => {
    bannerRows({ ...source, client_id: null, created_by: id(99) })
    const pinned = await pinReferencesIn(db, project, actor, [], { id: source.id, expectedContentHash: null }, deps)
    bannerRows({ ...source, client_id: null, created_by: id(99) }, [])
    expect(await checkReferencesIn(db, project, actor, pinned, deps)).toEqual([expect.objectContaining({ code: 'brand_kit_unavailable' })])
  })
  it('fails closed for a kit without a request authority context', async () => {
    bannerRows(source)
    await expect(pinReferencesIn(db, project, actor, [], { id: source.id, expectedContentHash: null })).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('application metadata waiting deadline', () => {
  it('stops waiting for a stalled HEAD and rejects later HEADs without dispatch', async () => {
    vi.useFakeTimers()
    try {
      head.mockReturnValue(new Promise(() => {}))
      const deps = { metadataBudget: { remainingMs: 100 } }
      const pending = storyboardFileMetadata('canonical/source.png', deps)
      const rejected = expect(pending).rejects.toThrow('metadata deadline exceeded')
      await vi.advanceTimersByTimeAsync(100)
      await rejected
      await expect(storyboardFileMetadata('canonical/source.png', deps)).rejects.toThrow('metadata deadline exceeded')
      expect(head).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
  it('counts HEAD waiting rather than intervening SQL or lock wait time', async () => {
    vi.useFakeTimers()
    try {
      const deps = { metadataBudget: { remainingMs: 100 } }
      head.mockResolvedValue({ etag: 'fixture', size: 12 })
      await storyboardFileMetadata('canonical/source.png', deps)
      await vi.advanceTimersByTimeAsync(30_000)
      await expect(storyboardFileMetadata('canonical/source.png', deps)).resolves.toMatchObject({ etag: 'fixture' })
      expect(deps.metadataBudget.remainingMs).toBe(100)
    } finally { vi.useRealTimers() }
  })
})
