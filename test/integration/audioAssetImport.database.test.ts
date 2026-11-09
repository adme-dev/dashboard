import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { INSERT_IMPORTED_AUDIO_ASSET_SQL } from '../../server/utils/audio/importAudio'
import { canonicalReferenceIn } from '../../server/utils/video-storyboard/references'

// Only the private object HEAD is stubbed; authorization runs against real rows.
vi.mock('~~/server/utils/storage', () => ({ getFileMetadata: async () => ({ etag: 'fixture-etag', size: 2048, contentType: 'audio/wav' }) }))

const connectionString = process.env.STORYBOARD_TEST_DATABASE_URL
if (connectionString) {
  const url = new URL(connectionString)
  if (!(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/video_storyboard_recovery_test' && url.port && !url.search)) {
    throw new Error('STORYBOARD_TEST_DATABASE_URL must be the isolated localhost video_storyboard_recovery_test database')
  }
}
const pool = connectionString ? new Pool({ connectionString, max: 2 }) : null
afterAll(async () => {
  await pool?.end()
})

function params(overrides: Record<number, unknown> = {}) {
  const id = randomUUID()
  const base: unknown[] = [id, null, randomUUID(), 'music', 'Tone', `audio/org/${id}/master.wav`, 30, 'wav', `audio-import:${randomUUID()}:k`,
    'tone.wav', 'audio/wav', 'a'.repeat(64), 1024, randomUUID(), randomUUID()]
  for (const [index, value] of Object.entries(overrides)) base[Number(index)] = value
  return base
}

describe.skipIf(!pool)('audio asset import provenance on localhost', () => {
  it('inserts a ready imported asset with full provenance', async () => {
    const row = (await pool!.query(INSERT_IMPORTED_AUDIO_ASSET_SQL, params())).rows[0]
    expect(row).toMatchObject({ kind: 'music', status: 'ready', source: 'imported', source_mime: 'audio/wav', format: 'wav' })
    expect(row.rights_confirmed_at).not.toBeNull()
  })
  it('rejects imported rows without provenance or with an invalid hash or duration', async () => {
    await expect(pool!.query(INSERT_IMPORTED_AUDIO_ASSET_SQL, params({ 11: 'not-a-hash' }))).rejects.toThrow(/import_provenance/)
    await expect(pool!.query(INSERT_IMPORTED_AUDIO_ASSET_SQL, params({ 6: 0 }))).rejects.toThrow(/import_provenance/)
    await expect(pool!.query(INSERT_IMPORTED_AUDIO_ASSET_SQL, params({ 10: 'video/mp4' }))).rejects.toThrow(/import_provenance/)
  })
  it('rejects NULL provenance that a bare comparison would let through', async () => {
    for (const index of [10, 11, 12, 6]) {
      await expect(pool!.query(INSERT_IMPORTED_AUDIO_ASSET_SQL, params({ [index]: null }))).rejects.toThrow(/import_provenance/)
    }
  })

  it('lets the origin project owner use audio an admin imported, but not other creators\' generated audio', async () => {
    const owner = { id: randomUUID(), role: 'member' }
    const admin = randomUUID()
    const project = (await pool!.query(`INSERT INTO media_projects (created_by, media_type, title) VALUES ($1, 'av', 'Synthetic import access') RETURNING id`, [owner.id])).rows[0].id
    const imported = params({ 2: admin, 13: project })
    await pool!.query(INSERT_IMPORTED_AUDIO_ASSET_SQL, imported)
    const generated = randomUUID()
    await pool!.query(`INSERT INTO audio_assets (id, created_by, kind, status, channels, r2_key_master) VALUES ($1,$2,'music','done','{}','audio/org/x/master.mp3')`, [generated, admin])
    const client = await pool!.connect()
    try {
      const scope = { id: project, clientId: null, createdBy: owner.id }
      await expect(canonicalReferenceIn(client, scope, owner, 'audio_asset', String(imported[0]))).resolves.toMatchObject({ identityKind: 'record_and_object' })
      await expect(canonicalReferenceIn(client, scope, owner, 'audio_asset', generated)).rejects.toMatchObject({ statusCode: 403 })
      const stranger = { id: randomUUID(), role: 'member' }
      await expect(canonicalReferenceIn(client, scope, stranger, 'audio_asset', String(imported[0]))).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      client.release()
    }
  })

  it('keeps generated assets valid with the default source', async () => {
    const row = (await pool!.query(`INSERT INTO audio_assets (id, created_by, kind, status, channels) VALUES ($1,$2,'voiceover','queued','{}') RETURNING source`, [randomUUID(), randomUUID()])).rows[0]
    expect(row.source).toBe('generated')
  })
})
