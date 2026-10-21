import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAsset, getMusicAssetByIdempotencyKey, requeueFailedMusicAsset } from '~~/server/utils/audio/assets'
import { musicIdempotencyKey } from '~~/server/utils/audio/musicJob'

const transport = vi.hoisted(() => ({ one: vi.fn(), rows: vi.fn(), presign: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: transport.one, queryRows: transport.rows }))
vi.mock('~~/server/utils/storage', () => ({
  uploadFile: vi.fn(), getPresignedDownloadUrl: transport.presign, isStorageConfigured: () => true
}))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLIENT = id(1)
const FOREIGN = id(2)
const OWN_ASSET = id(10)
const FOREIGN_ASSET = id(11)
const AGENCY_ASSET = id(12)
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE audio_assets (
    id uuid PRIMARY KEY, client_id uuid, created_by text, kind text, status text,
    idempotency_key text UNIQUE, r2_key_master text, variants jsonb, error text,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`)
  transport.one.mockImplementation(async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] ?? null)
  transport.rows.mockImplementation(async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows)
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  vi.clearAllMocks()
  transport.presign.mockImplementation(async (key: string) => `https://signed.example/${key}`)
  await db.exec('TRUNCATE audio_assets')
  for (const [assetId, clientId] of [[OWN_ASSET, CLIENT], [FOREIGN_ASSET, FOREIGN], [AGENCY_ASSET, null]]) {
    await db.query(`INSERT INTO audio_assets(id,client_id,created_by,kind,status,idempotency_key,r2_key_master,variants,error)
      VALUES($1,$2,'synthetic-staff','music','failed',$3,$4,$5::jsonb,'provider failed')`,
    [assetId, clientId, `key-${assetId}`, `audio/${assetId}/master.mp3`, JSON.stringify({ radio: `audio/${assetId}/radio.mp3` })])
  }
})

describe('audio asset trusted client scope', () => {
  it.each([FOREIGN_ASSET, AGENCY_ASSET])('does not read or sign inaccessible asset %s', async (assetId) => {
    expect(await getAsset(assetId, CLIENT)).toBeNull()
    expect(transport.presign).not.toHaveBeenCalled()
    // Check the native query result as well: filtering after selecting is too late.
    const [sql, params] = transport.one.mock.calls[0]
    expect((await db.query(sql, params)).rows).toEqual([])
  })
  it('returns and signs the selected client asset', async () => {
    expect(await getAsset(OWN_ASSET, CLIENT)).toMatchObject({
      id: OWN_ASSET, clientId: CLIENT,
      streamUrl: `/api/agency/audio/assets/${OWN_ASSET}/stream`,
      variantUrls: { radio: `https://signed.example/audio/${OWN_ASSET}/radio.mp3` }
    })
  })
  it.each([FOREIGN_ASSET, AGENCY_ASSET])('does not resolve an inaccessible music idempotency collision %s', async (assetId) => {
    expect(await getMusicAssetByIdempotencyKey(`key-${assetId}`, CLIENT)).toBeNull()
    const [sql, params] = transport.one.mock.calls[0]
    expect((await db.query(sql, params)).rows).toEqual([])
  })
  it('resolves a music idempotency collision owned by the selected client', async () => {
    expect(await getMusicAssetByIdempotencyKey(`key-${OWN_ASSET}`, CLIENT)).toMatchObject({ id: OWN_ASSET, clientId: CLIENT })
  })
  it.each([FOREIGN_ASSET, AGENCY_ASSET])('does not requeue inaccessible failed music %s', async (assetId) => {
    expect(await requeueFailedMusicAsset(assetId, CLIENT)).toBe(false)
    expect((await db.query('SELECT status,error FROM audio_assets WHERE id=$1', [assetId])).rows)
      .toEqual([{ status: 'failed', error: 'provider failed' }])
  })
  it('requeues owned failed music and clears its error', async () => {
    expect(await requeueFailedMusicAsset(OWN_ASSET, CLIENT)).toBe(true)
    expect((await db.query('SELECT status,error FROM audio_assets WHERE id=$1', [OWN_ASSET])).rows)
      .toEqual([{ status: 'queued', error: null }])
    expect(await requeueFailedMusicAsset(OWN_ASSET, CLIENT)).toBe(false)
  })
  it.each(['', 'not-a-uuid', null, 42])('fails closed for malformed supplied scope %j before database access', async (scope) => {
    await expect(getAsset(OWN_ASSET, scope as unknown as string)).rejects.toThrow()
    await expect(getMusicAssetByIdempotencyKey(`key-${OWN_ASSET}`, scope as unknown as string)).rejects.toThrow()
    await expect(requeueFailedMusicAsset(OWN_ASSET, scope as unknown as string)).rejects.toThrow()
    expect(transport.one).not.toHaveBeenCalled()
    expect(transport.presign).not.toHaveBeenCalled()
  })
  it('preserves agency-wide access when no client scope is supplied', async () => {
    for (const assetId of [OWN_ASSET, FOREIGN_ASSET, AGENCY_ASSET]) {
      expect(await getAsset(assetId)).toMatchObject({ id: assetId })
      expect(await getMusicAssetByIdempotencyKey(`key-${assetId}`)).toMatchObject({ id: assetId })
      expect(await requeueFailedMusicAsset(assetId)).toBe(true)
    }
  })
})

describe('music idempotency client isolation', () => {
  const brief = { createdBy: 'u1', prompt: 'warm acoustic bed', isInstrumental: true, lyrics: null }
  it('distinguishes the same user and brief across clients', () => {
    const own = musicIdempotencyKey({ ...brief, clientScope: CLIENT })
    expect(own).not.toBe(musicIdempotencyKey({ ...brief, clientScope: FOREIGN }))
    expect(own).not.toBe(musicIdempotencyKey(brief))
    expect(own).toBe(musicIdempotencyKey({ ...brief, clientScope: CLIENT }))
  })
  it('retains the byte-for-byte legacy key for unscoped callers', () => {
    expect(musicIdempotencyKey(brief)).toBe('music:bcd4b0707793793c1c53343fc0b012d2')
    expect(musicIdempotencyKey({ ...brief, clientScope: undefined })).toBe('music:bcd4b0707793793c1c53343fc0b012d2')
  })
})
