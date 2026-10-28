import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  asset: null as Record<string, unknown> | null,
  bucket: {} as unknown,
  order: [] as string[],
  finalizeFails: false,
  txQueries: [] as Array<{ sql: string, params: unknown[] }>
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(async (sql: string) => sql.includes('FROM search_authority_content_assets asset') ? h.asset : null),
  queryRows: vi.fn(async () => []),
  execute: vi.fn(async (sql: string) => {
    h.order.push(sql.includes('status = \'failed\'') ? 'publication_failed' : 'execute')
    return 1
  }),
  transaction: vi.fn(async (cb: (db: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }) => unknown) => cb({
    query: async (sql: string, params: unknown[]) => {
      h.txQueries.push({ sql, params })
      if (sql.includes('INSERT INTO search_authority_publications')) {
        h.order.push('reserve')
        return { rows: [{ id: 'pub-1' }] }
      }
      if (sql.includes('status = \'published\'') && h.finalizeFails) throw new Error('db down')
      return { rows: [] }
    }
  }))
}))
vi.mock('~~/server/utils/searchAuthority/godModeMutations', () => ({
  executeSearchAuthorityExternalMutation: vi.fn(async (_event: unknown, kind: string, work: (run: unknown) => unknown) => {
    h.order.push(`family:${kind}`)
    return work({ ids: ['pub-1'], replay: false, replayResult: null, markDispatched: async () => {
      h.order.push('dispatched')
    } })
  })
}))
vi.mock('~~/server/utils/searchAuthority/publicationRenderer', () => ({
  renderSearchAuthorityPublication: vi.fn(() => ({ html: '<html/>', contentType: 'text/html', etag: 'e', canonicalUrl: 'https://learn.dealer.example/guides/a' }))
}))
vi.mock('~~/server/utils/searchAuthority/publicationStore', () => ({
  resolveSearchAuthorityPublicationBucket: vi.fn(() => h.bucket),
  activateSearchAuthorityPublication: vi.fn(async () => {
    h.order.push('activate')
    return { manifestVersion: 'm2', previousManifestVersion: 'm1' }
  }),
  restoreSearchAuthorityPublicationPointer: vi.fn(async () => { h.order.push('restore') })
}))

const { publishSearchAuthorityContent } = await import('~~/server/utils/searchAuthority/contentPublication')
const store = await import('~~/server/utils/searchAuthority/publicationStore')

const CLIENT = '11111111-1111-4111-8111-111111111111'
const ASSET = '22222222-2222-4222-8222-222222222222'
const VERSION = '33333333-3333-4333-8333-333333333333'
const approved = () => ({
  id: ASSET, client_id: CLIENT, title: 'Guide', slug: 'guide', status: 'approved', current_version_id: VERSION,
  content_hostname: 'learn.dealer.example', canonical_hostname: 'dealer.example', site_public_id: 'p', publishing_mode: 'subdomain',
  client_name: 'Dealer', body_markdown: '# body text here', excerpt: 'excerpt', disclaimer: 'd', schema_type: 'Article', created_at: 'now'
})
const input = (extra: Record<string, unknown> = {}) => ({ clientId: CLIENT, assetId: ASSET, actorId: 'actor-1', ...extra })

describe('shared Search Authority publication service', () => {
  beforeEach(() => {
    Object.assign(h, { asset: approved(), bucket: {}, order: [], finalizeFails: false, txQueries: [] })
    vi.clearAllMocks()
  })

  it.each([
    ['missing asset', () => { h.asset = null }, 404],
    ['not approved', () => { h.asset = { ...approved(), status: 'in_review' } }, 409],
    ['no verified hostname', () => { h.asset = { ...approved(), content_hostname: null } }, 409],
    ['no storage', () => { h.bucket = null }, 503]
  ])('refuses %s before any reservation or provider write', async (_label, arrange, statusCode) => {
    arrange()
    const onDispatchStart = vi.fn()
    await expect(publishSearchAuthorityContent({} as never, input({ onDispatchStart }))).rejects.toMatchObject({ statusCode })
    expect(onDispatchStart).not.toHaveBeenCalled()
    expect(h.order).toEqual([])
  })

  it('refuses a changed approved version when an exact version is required', async () => {
    const onDispatchStart = vi.fn()
    await expect(publishSearchAuthorityContent({} as never, input({ expectedVersionId: '44444444-4444-4444-8444-444444444444', onDispatchStart })))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(onDispatchStart).not.toHaveBeenCalled()
    expect(store.activateSearchAuthorityPublication).not.toHaveBeenCalled()
  })

  it('signals dispatch before reserving, activates, then records publication and audit for the actor', async () => {
    const onDispatchStart = vi.fn(() => {
      h.order.push('dispatch_start')
    })
    const result = await publishSearchAuthorityContent({} as never, input({ expectedVersionId: VERSION, onDispatchStart }))
    expect(result).toEqual({ ok: true, publicationId: 'pub-1', versionId: VERSION, manifestVersion: 'm2', publicUrl: 'https://learn.dealer.example/guides/a' })
    expect(h.order).toEqual(['family:publish', 'dispatch_start', 'reserve', 'activate', 'dispatched'])
    const published = h.txQueries.find(q => q.sql.includes('status = \'published\''))!
    expect(published.params).toContain('actor-1')
    expect(h.txQueries.some(q => q.sql.includes('\'publication.published\'') && q.params.includes('actor-1'))).toBe(true)
  })

  it('restores the previous manifest pointer when finalisation fails', async () => {
    h.finalizeFails = true
    await expect(publishSearchAuthorityContent({} as never, input())).rejects.toThrow('db down')
    expect(h.order.slice(-2)).toEqual(['restore', 'publication_failed'])
    expect(store.restoreSearchAuthorityPublicationPointer).toHaveBeenCalledWith(h.bucket, expect.objectContaining({ targetManifestVersion: 'm1' }))
  })
})
