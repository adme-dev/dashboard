import { describe, expect, it, vi } from 'vitest'
import {
  getMetaCatalogConnectionAuthority,
  listMetaCatalogFeedBindings,
  persistMetaCatalogFeedEvidence
} from '~~/server/utils/metaCatalogRepository'

describe('Meta catalogue repository authority', () => {
  it('loads a Meta connection only through the exact mapped client boundary', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      id: 'connection-1',
      client_id: 'client-1',
      client_name: 'Geelong GWM Haval',
      account_id: '1444686743700725',
      account_name: 'Geelong GWM',
      access_token: 'token',
      token_expires_at: '2026-09-01T00:00:00.000Z',
      metadata: { actId: 'act_1444686743700725' }
    })

    await expect(getMetaCatalogConnectionAuthority('client-1', 'connection-1', { queryOne }))
      .resolves.toMatchObject({
        id: 'connection-1',
        clientId: 'client-1',
        clientName: 'Geelong GWM Haval',
        actId: 'act_1444686743700725'
      })

    expect(queryOne).toHaveBeenCalledWith(expect.stringMatching(
      /sc\.client_id = \$1[\s\S]*sc\.id = \$2[\s\S]*sc\.platform = 'meta'[\s\S]*sc\.status = 'active'/
    ), ['client-1', 'connection-1'])
  })

  it('lists only bindings inside the same client and connection scope', async () => {
    const queryRows = vi.fn().mockResolvedValue([{
      source_feed_id: 'source-used',
      source_feed_url: 'https://socials.driveagent.io/api/feeds/source-used/serve',
      product_catalog_id: 'catalog-1',
      product_feed_id: 'product-feed-1',
      latest_upload_id: 'upload-1',
      last_verified_at: '2026-08-14T04:00:00.000Z',
      state: 'ready'
    }])

    await expect(listMetaCatalogFeedBindings('client-1', 'connection-1', { queryRows }))
      .resolves.toEqual([{
        sourceFeedId: 'source-used',
        sourceFeedUrl: 'https://socials.driveagent.io/api/feeds/source-used/serve',
        catalogId: 'catalog-1',
        productFeedId: 'product-feed-1',
        latestUploadId: 'upload-1',
        lastVerifiedAt: '2026-08-14T04:00:00.000Z',
        state: 'READY'
      }])
    expect(queryRows).toHaveBeenCalledWith(expect.any(String), ['client-1', 'connection-1'])
  })

  it('upserts exact provider readback and appends an audit event in one transaction', async () => {
    const queries: Array<{ sql: string, params?: unknown[] }> = []
    const transaction = vi.fn(async (callback: (db: {
      query(sql: string, params?: unknown[]): Promise<{ rows: Array<{ id?: string }> }>
    }) => Promise<unknown>) => callback({
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params })
        if (sql.includes('INSERT INTO meta_catalog_feed_bindings')) return { rows: [{ id: 'binding-1' }] }
        return { rows: [] }
      })
    }))

    await persistMetaCatalogFeedEvidence({
      clientId: 'client-1',
      connectionId: 'connection-1',
      sourceFeedId: 'source-used',
      sourceFeedUrl: 'https://socials.driveagent.io/api/feeds/source-used/serve',
      businessId: 'business-1',
      catalogId: 'catalog-1',
      productFeedId: 'product-feed-1',
      uploadId: 'upload-1',
      feedDisposition: 'created',
      state: 'READY',
      readback: {
        id: 'product-feed-1',
        name: 'Geelong GWM Haval — Used Vehicles',
        schedule: { interval: 'DAILY', url: 'https://socials.driveagent.io/api/feeds/source-used/serve' },
        latest_upload: { id: 'upload-1', status: 'IN_PROGRESS' }
      },
      actorId: 'actor-1'
    }, { transaction })

    expect(queries).toHaveLength(2)
    expect(queries[0]?.sql).toContain('INSERT INTO meta_catalog_feed_bindings')
    expect(queries[1]?.sql).toContain('INSERT INTO meta_catalog_feed_audit_events')
    expect(queries[1]?.params).toContain('created')
    expect(queries[1]?.params).toContain('upload_requested')
    expect(queries[1]?.params).toContain('verified')
    expect(JSON.stringify(queries)).not.toContain('access_token')
    expect(JSON.stringify(queries)).not.toContain('secret-token')
  })
})
