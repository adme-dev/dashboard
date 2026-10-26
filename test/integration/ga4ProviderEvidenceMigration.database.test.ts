import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Dedicated local PostgreSQL only. This test creates and removes its own schema.
const databaseUrl = process.env.GA4_SCHEMA_TEST_DATABASE_URL
const migration = (name: string) => readFileSync(new URL(`../../server/database/migrations/${name}`, import.meta.url), 'utf8')
const fix = migration('482_ga4_provider_test_evidence.sql')
const pairs = [
  ['meta', 'meta_test_events'],
  ['google_data_manager', 'google_validate_only'],
  ['tiktok', 'tiktok_test_events'],
  ['ga4', 'ga4_debug_validation']
] as const

describe.skipIf(!databaseUrl)('GA4 provider evidence migration against PostgreSQL', () => {
  const schema = `ga4_evidence_${crypto.randomUUID().replaceAll('-', '')}`
  const clientId = crypto.randomUUID()
  const otherClientId = crypto.randomUUID()
  const profileId = crypto.randomUUID()
  const destinationId = crypto.randomUUID()
  let db: pg.Client
  let connected = false

  async function insert(platform: string, mode: string, tenant = clientId) {
    return db.query(`INSERT INTO measurement_provider_test_runs (
      client_id, profile_id, destination_id, platform, mode,
      canonical_event_name, provider_event_name, config_version,
      idempotency_key, actor_id, reason
    ) VALUES ($1, $2, $3, $4, $5, 'web_conversion', 'generate_lead', 1, $6, 'test-actor', 'Local SQL regression')
    RETURNING id`, [tenant, profileId, destinationId, platform, mode, crypto.randomUUID()])
  }

  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('GA4 schema regression requires a dedicated local PostgreSQL database')
    }
    db = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 })
    await db.connect()
    connected = true
    await db.query(`CREATE SCHEMA ${schema}`)
    await db.query(`SET search_path TO ${schema}`)
    // Minimal referenced parents; the evidence table and trigger use the real migration.
    await db.query(`CREATE TABLE agency_clients (id uuid PRIMARY KEY);
      CREATE TABLE client_measurement_profiles (client_id uuid, id uuid, UNIQUE (client_id, id));
      CREATE TABLE conversion_destinations (client_id uuid, id uuid, UNIQUE (client_id, id));`)
    await db.query('INSERT INTO agency_clients VALUES ($1), ($2)', [clientId, otherClientId])
    await db.query('INSERT INTO client_measurement_profiles VALUES ($1, $2)', [clientId, profileId])
    await db.query('INSERT INTO conversion_destinations VALUES ($1, $2)', [clientId, destinationId])
    await db.query(migration('258_measurement_provider_test_runs.sql'))
    // Reproduce the live pre-fix extension discovered by the read-only constraint audit.
    await db.query(`ALTER TABLE measurement_provider_test_runs
      DROP CONSTRAINT measurement_provider_test_runs_platform_check,
      DROP CONSTRAINT measurement_provider_test_runs_mode_check,
      DROP CONSTRAINT measurement_provider_test_runs_check1,
      ADD CONSTRAINT measurement_provider_test_runs_platform_check CHECK (platform IN ('meta', 'google_data_manager', 'tiktok')),
      ADD CONSTRAINT measurement_provider_test_runs_mode_check CHECK (mode IN ('meta_test_events', 'google_validate_only', 'tiktok_test_events')),
      ADD CONSTRAINT measurement_provider_test_runs_check1 CHECK (
        (platform = 'meta' AND mode = 'meta_test_events') OR
        (platform = 'google_data_manager' AND mode = 'google_validate_only') OR
        (platform = 'tiktok' AND mode = 'tiktok_test_events'))`)
  })

  afterAll(async () => {
    if (!connected) return
    try {
      await db.query('ROLLBACK')
      await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      expect((await db.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema])).rows).toEqual([])
    } finally { await db.end() }
  })

  it('reproduces the GA4 constraint failure, extends the live pairs, and is repeatable', async () => {
    await expect(insert('ga4', 'ga4_debug_validation')).rejects.toMatchObject({ code: '23514' })
    for (const [platform, mode] of pairs.slice(0, 3)) await insert(platform, mode)
    await db.query(fix)
    for (const [platform, mode] of pairs) await insert(platform, mode)
    await db.query(fix)
    expect((await db.query('SELECT COUNT(*)::int AS count FROM measurement_provider_test_runs')).rows[0].count).toBe(7)
  })

  it('rejects all cross-provider mode combinations and unknown values', async () => {
    for (const [platform, correctMode] of pairs) {
      for (const [, mode] of pairs) {
        if (mode === correctMode) continue
        await expect(insert(platform, mode)).rejects.toMatchObject({ code: '23514' })
      }
    }
    await expect(insert('unknown', 'ga4_debug_validation')).rejects.toMatchObject({ code: '23514' })
    await expect(insert('ga4', 'unknown')).rejects.toMatchObject({ code: '23514' })
  })

  it('preserves tenant foreign keys and requested-to-terminal immutable evidence', async () => {
    await expect(insert('ga4', 'ga4_debug_validation', otherClientId)).rejects.toMatchObject({ code: '23503' })
    const id = (await insert('ga4', 'ga4_debug_validation')).rows[0].id
    await expect(db.query('UPDATE measurement_provider_test_runs SET reason = $2 WHERE id = $1', [id, 'changed']))
      .rejects.toMatchObject({ code: 'P0001' })
    await expect(db.query("UPDATE measurement_provider_test_runs SET status = 'accepted' WHERE id = $1", [id]))
      .rejects.toMatchObject({ code: 'P0001' })
    await db.query("UPDATE measurement_provider_test_runs SET status = 'accepted', completed_at = NOW() WHERE id = $1", [id])
    await expect(db.query("UPDATE measurement_provider_test_runs SET status = 'failed' WHERE id = $1", [id]))
      .rejects.toMatchObject({ code: 'P0001' })
    await expect(db.query('DELETE FROM measurement_provider_test_runs WHERE id = $1', [id]))
      .rejects.toMatchObject({ code: 'P0001' })
    expect((await db.query('SELECT status FROM measurement_provider_test_runs WHERE id = $1', [id])).rows[0].status).toBe('accepted')
  })
})
