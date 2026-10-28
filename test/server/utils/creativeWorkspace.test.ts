import { describe, it, expect, vi } from 'vitest'
import { searchCreativeWorkspace, resolveCreativeWorkspaceScope, type CreativeWorkspaceReadDeps } from '~~/server/utils/ai/creativeWorkspace/search'
import { creativeWorkspaceCapabilities } from '~~/server/utils/ai/creativeWorkspace/catalog'
import type { MarketingReadScope } from '~~/server/utils/ai/marketing/readScope'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: vi.fn(), queryOneFresh: vi.fn() }))
vi.mock('~~/server/utils/godMode/authority', () => ({ resolveGodModeAuthority: vi.fn(), isActiveGodModeAuthority: vi.fn() }))
const actor = '11111111-1111-4111-8111-111111111111'
const client = '22222222-2222-4222-8222-222222222222'
const other = '33333333-3333-4333-8333-333333333333'
const item = '44444444-4444-4444-8444-444444444444'
const ctx = { userId: actor, userRole: 'creative', source: 'mcp', event: {} } as ToolContext
const scope = (patch: Partial<MarketingReadScope> = {}): MarketingReadScope => ({ actorUserId: actor, clientIds: [client], activeClientsOnly: false, ownerVerified: false, permissionGroups: ['CREATIVE'], reportingGranted: false, financialReadAllowed: false, ownerRefreshAllowed: false, ...patch })
function deps(patch: Partial<MarketingReadScope> = {}, rows: unknown[] = []) {
  return { resolveScope: vi.fn().mockResolvedValue(scope(patch)), query: vi.fn().mockResolvedValue(rows) } as unknown as CreativeWorkspaceReadDeps & { query: ReturnType<typeof vi.fn>; resolveScope: ReturnType<typeof vi.fn> }
}
const row = (patch: Record<string, unknown> = {}) => ({ id: item, name: 'Campaign art', client_id: client, asset_type: 'image/png', updated_at: '2026-10-28T04:00:00Z', ...patch })

describe('creative workspace metadata boundaries', () => {
  it('requires a fresh creative scope before any source query', async () => {
    const d = deps({ permissionGroups: ['MEDIA_BUYING'] })
    await expect(searchCreativeWorkspace({}, ctx, d)).rejects.toMatchObject({ statusCode: 403 })
    expect(d.query).not.toHaveBeenCalled()
    await expect(resolveCreativeWorkspaceScope(ctx, deps({ actorUserId: other }))).rejects.toMatchObject({ statusCode: 403 })
    await expect(resolveCreativeWorkspaceScope(ctx, deps({ ownerVerified: true, permissionGroups: [] }))).resolves.toMatchObject({ ownerVerified: true })
  })
  it('zero assignments and unauthorized requested clients cannot become an agency-wide search', async () => {
    const d = deps({ clientIds: [] })
    expect(await searchCreativeWorkspace({}, ctx, d)).toMatchObject({ items: [], scopeLimited: true })
    expect(d.query).not.toHaveBeenCalled()
    const assigned = deps()
    expect(await searchCreativeWorkspace({ clientId: other }, ctx, assigned)).toMatchObject({ items: [] })
    expect(assigned.query).not.toHaveBeenCalled()
  })
  it('resolves authority on each call and stops after client assignment revocation', async () => {
    const d = deps({}, [row()])
    await searchCreativeWorkspace({ sources: ['banner_assets'] }, ctx, d)
    d.resolveScope.mockResolvedValue(scope({ clientIds: [] }))
    expect(await searchCreativeWorkspace({ sources: ['banner_assets'] }, ctx, d)).toMatchObject({ items: [] })
    expect(d.resolveScope).toHaveBeenCalledTimes(2)
    expect(d.query).toHaveBeenCalledTimes(1)
    d.resolveScope.mockRejectedValue(new Error('authority storage unavailable'))
    await expect(searchCreativeWorkspace({}, ctx, d)).rejects.toThrow('authority storage unavailable')
    expect(d.query).toHaveBeenCalledTimes(1)
  })
  it('intersects a client filter before every SQL ORDER/LIMIT and escapes literal wildcards', async () => {
    const d = deps({ clientIds: [client, other] })
    await searchCreativeWorkspace({ query: 'Ford%_\\', clientId: client, limit: 7 }, ctx, d)
    expect(d.query).toHaveBeenCalledTimes(5)
    for (const [sql, values] of d.query.mock.calls) {
      expect(sql).toMatch(/client_id = ANY\(\$1::uuid\[\]\)/)
      expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('ORDER BY'))
      expect(values[0]).toEqual([client])
      expect(values).toContain('%Ford\\%\\_\\\\%')
      expect(values.at(-1)).toBe(8)
      expect(sql).not.toContain('Ford')
    }
  })
  it('all-active authority still checks active clients and optional client narrowing', async () => {
    const d = deps({ clientIds: null, activeClientsOnly: true, permissionGroups: ['CREATIVE', 'MANAGEMENT'] })
    await searchCreativeWorkspace({ sources: ['edm_templates'], clientId: client }, ctx, d)
    expect(d.query.mock.calls[0][0]).toContain('authorized_client.is_active = true')
    expect(d.query.mock.calls[0][1][0]).toEqual([client])
  })
  it('preserves video creator/project-creator visibility alongside the client predicate', async () => {
    const d = deps()
    await searchCreativeWorkspace({ sources: ['video_assets'] }, ctx, d)
    const [sql, values] = d.query.mock.calls[0]
    expect(sql).toContain('LEFT JOIN media_projects mp ON mp.id = va.source_project_id')
    expect(sql).toContain('(va.created_by = $2::uuid OR mp.created_by = $2::uuid)')
    expect(values).toEqual([[client], actor, 31])
    const admin = deps({ permissionGroups: ['CREATIVE', 'ADMIN'] })
    await searchCreativeWorkspace({ sources: ['video_assets'] }, ctx, admin)
    expect(admin.query.mock.calls[0][0]).not.toContain('va.created_by =')
    expect(admin.query.mock.calls[0][0]).toContain('client_id = ANY')
  })
  it('projects only safe named metadata and excludes scoped dissection assets/projects at SQL source', async () => {
    const d = deps({}, [row({ r2_key: 'secret', url: 'https://private.invalid', body_html: '<p>private</p>', prompt: 'private', created_by: other })])
    const result = await searchCreativeWorkspace({ sources: ['banner_assets'] }, ctx, d)
    expect(result.items).toEqual([{ ref: 'banner_assets:' + item, source: 'banner_assets', id: item, name: 'Campaign art', clientId: client, type: 'image/png', updatedAt: '2026-10-28T04:00:00Z' }])
    expect(d.query.mock.calls[0][0]).toContain("ba.r2_key NOT LIKE 'scoped-dissection-assets/%'")
    expect(d.query.mock.calls[0][0]).not.toMatch(/SELECT \*/)
    await searchCreativeWorkspace({ sources: ['banner_projects'] }, ctx, d)
    expect(d.query.mock.calls[1][0]).toContain('dissectionSource|scoped-dissection-assets')
  })
  it('uses source-qualified references and truthful bounded cross-source truncation', async () => {
    const d = deps({}, [row(), row({ id: other, updated_at: '2026-10-27T04:00:00Z' })])
    const result = await searchCreativeWorkspace({ sources: ['audio_assets', 'edm_templates', 'audio_assets'], limit: 1 }, ctx, d)
    expect(d.query).toHaveBeenCalledTimes(2)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].ref).toBe('audio_assets:' + item)
    expect(result.truncated).toBe(true)
    expect(result).not.toHaveProperty('total')
  })
  it('does not report failed sources as empty successful results', async () => {
    const d = deps()
    d.query.mockRejectedValueOnce(new Error('database down'))
    await expect(searchCreativeWorkspace({ sources: ['edm_templates'] }, ctx, d)).rejects.toThrow('database down')
    const unbounded = deps({}, Array(32).fill(row()))
    await expect(searchCreativeWorkspace({ sources: ['audio_assets'] }, ctx, unbounded)).rejects.toThrow('Unbounded')
  })
  it('rejects unknown sources, UUID aliases, excess limits and caller-supplied authority before querying', async () => {
    const d = deps()
    for (const args of [{ sources: ['unknown'] }, { clientId: 'all' }, { limit: 51 }, { ownerVerified: true }, { query: 'x'.repeat(161) }]) {
      await expect(searchCreativeWorkspace(args, ctx, d)).rejects.toThrow()
    }
    expect(d.query).not.toHaveBeenCalled()
  })
  it('marks native browser editors pending and metadata discovery without claiming live edits', () => {
    const capabilities = creativeWorkspaceCapabilities()
    expect(capabilities.discovery.fileAccess).toBe(false)
    expect(capabilities.discovery.editing).toBe(false)
    expect(capabilities.modules.filter(m => m.integration === 'browser_bridge_required')).toHaveLength(6)
    expect(capabilities.note).toContain('not enabled')
  })
})
