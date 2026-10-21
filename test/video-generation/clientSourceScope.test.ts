import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

import { assertResolvableSources, listApprovedVideoGenerationSourceAssets } from '~~/server/utils/video-generation/sourceAssetStore'
import { loadVideoGenerationSourceAssets } from '~~/server/utils/video-generation/sourceAssets'
import { resolveSourceAssetUrls } from '~~/server/utils/video-generation/resolveSourceUrls'

const db = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows
}))

const client = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const ownId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const agencyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const database = new PGlite()

beforeAll(async () => {
  await database.exec(`CREATE TABLE video_gen_source_assets (
    id uuid PRIMARY KEY, client_id uuid, r2_key text, status text, content_type text,
    subject_type text, original_filename text, width integer, height integer,
    created_at timestamptz, source_system text, source_asset_ref text, source_metadata jsonb
  )`)
  await database.query(`INSERT INTO video_gen_source_assets (id,client_id,r2_key,status,created_at)
    VALUES ($1,$2,'own','approved','2026-01-01'), ($3,$4,'other','approved','2026-02-01'),
    ($5,NULL,'agency','approved','2026-02-01')`, [ownId, client, otherId, other, agencyId])
  await database.exec(`INSERT INTO video_gen_source_assets (id,client_id,r2_key,status,created_at)
    SELECT md5(n::text)::uuid,NULL,'shared','approved','2026-03-01'::timestamptz
    FROM generate_series(1,201) AS n`)
  db.query.mockImplementation((sql, params) => database.query(sql, params))
})
afterAll(() => database.close())

describe('dealer connector video source ownership', () => {
  it('filters shared assets before the discovery cap', async () => {
    const sources = await listApprovedVideoGenerationSourceAssets(client, false)
    expect(sources.map(source => source.id)).toEqual([ownId])
  })

  it('preserves the shared agency library for legacy callers', async () => {
    const sources = await listApprovedVideoGenerationSourceAssets(client)
    expect(sources).toHaveLength(200)
    expect(sources.every(source => source.client_id === null)).toBe(true)
  })

  it('rejects null-client sources in strict validation', () => {
    expect(() => assertResolvableSources([
      { id: agencyId, client_id: null, r2_key: 'agency', status: 'approved' }
    ], [agencyId], client, false)).toThrow(/not owned/)
  })

  it.each([agencyId, otherId])('rejects unowned source metadata %s', async (id) => {
    await expect(loadVideoGenerationSourceAssets([id], client, false)).rejects.toThrow(/not owned/)
  })

  it('loads matching source metadata', async () => {
    await expect(loadVideoGenerationSourceAssets([ownId], client, false)).resolves.toEqual([
      { id: ownId, approved: true, subjectType: 'unknown' }
    ])
  })

  it('never signs a URL for an agency source under strict scope', async () => {
    const deps = {
      load: vi.fn().mockResolvedValue([{ id: agencyId, client_id: null, r2_key: 'agency', status: 'approved' }]),
      presign: vi.fn()
    }
    await expect(resolveSourceAssetUrls([agencyId], client, deps, false)).rejects.toThrow(/not owned/)
    expect(deps.presign).not.toHaveBeenCalled()
  })
})
