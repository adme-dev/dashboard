import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.EMAIL_INGESTION_TEST_DATABASE_URL
const describePostgres = databaseUrl ? describe : describe.skip
const migration = readFileSync(
  new URL('../../../../server/database/migrations/319_universal_email_endpoint_management_hardening.sql', import.meta.url),
  'utf8'
)

function directDatabaseUrl(value: string) {
  const url = new URL(value)
  url.hostname = url.hostname.replace('-pooler.', '.')
  return url.toString()
}

describePostgres('email endpoint management hardening on isolated Postgres', () => {
  const schema = `email_endpoint_hardening_${randomUUID().replaceAll('-', '')}`
  let pool: pg.Pool

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: directDatabaseUrl(databaseUrl!) })
    const client = await pool.connect()
    try {
      await client.query(`CREATE SCHEMA ${schema}`)
      await client.query(`SET search_path TO ${schema}, public`)
      await client.query(`
        CREATE TABLE agency_clients (id UUID PRIMARY KEY);
        CREATE TABLE team_members (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL DEFAULT TRUE, user_role TEXT NOT NULL DEFAULT 'member');
        CREATE TABLE lead_email_endpoints (id UUID PRIMARY KEY, client_id UUID NOT NULL REFERENCES agency_clients(id));
        CREATE TABLE lead_form_rules (id UUID PRIMARY KEY, client_id UUID NOT NULL REFERENCES agency_clients(id));
        CREATE TABLE lead_rule_destinations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          rule_id UUID NOT NULL REFERENCES lead_form_rules(id),
          destination_type TEXT NOT NULL, config JSONB NOT NULL, filter JSONB,
          delay_minutes INTEGER NOT NULL DEFAULT 0, enabled BOOLEAN NOT NULL DEFAULT TRUE,
          sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `)
      // Forward migrations must converge when re-applied to an already-upgraded schema.
      await client.query(migration)
      await client.query(migration)
      await client.query(`
        INSERT INTO agency_clients VALUES ('11111111-1111-4111-8111-111111111111');
        INSERT INTO team_members VALUES ('22222222-2222-4222-8222-222222222222', TRUE, 'admin');
        INSERT INTO lead_email_endpoints VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');
        INSERT INTO lead_form_rules VALUES ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111');
        INSERT INTO lead_rule_destinations (id, rule_id, destination_type, config, filter, delay_minutes, enabled, sort_order)
        VALUES ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', 'portal', '{}'::jsonb, '{"country":"AU"}'::jsonb, 15, FALSE, 7);
      `)
    } finally {
      client.release()
    }
  }, 30_000)

  afterAll(async () => {
    const client = await pool.connect()
    try { await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`) } finally { client.release(); await pool.end() }
  })

  it('serializes concurrent preset claims, preserves custom fields, and exposes the audit safeguards', async () => {
    const first = await pool.connect()
    const second = await pool.connect()
    const claim = `
      WITH claimed AS (
        UPDATE lead_rule_destinations
        SET preset_key = $4
        WHERE id = (
          SELECT id FROM lead_rule_destinations
          WHERE rule_id = $1 AND destination_type = $2 AND config = $3::jsonb
            AND (preset_key IS NULL OR preset_key = $4)
          ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE
        ) RETURNING id
      ), inserted AS (
        INSERT INTO lead_rule_destinations
          (rule_id, destination_type, config, filter, delay_minutes, enabled, sort_order, preset_key)
        SELECT $1, $2, $3::jsonb, NULL, 0, TRUE, 0, $4
        WHERE NOT EXISTS (SELECT 1 FROM claimed)
        ON CONFLICT (rule_id, preset_key) WHERE preset_key IS NOT NULL
          DO UPDATE SET preset_key = EXCLUDED.preset_key
        RETURNING id
      ) SELECT id FROM claimed UNION ALL SELECT id FROM inserted
    `
    const params = ['44444444-4444-4444-8444-444444444444', 'portal', '{}', 'email_endpoint:portal:{}']
    try {
      await first.query(`SET search_path TO ${schema}, public`)
      await second.query(`SET search_path TO ${schema}, public`)
      await first.query('BEGIN')
      const firstClaim = await first.query(claim, params)
      const secondClaim = second.query(claim, params)
      await new Promise(resolve => setTimeout(resolve, 25))
      await first.query('COMMIT')
      const resolvedSecond = await secondClaim
      expect(firstClaim.rows[0].id).toBe('55555555-5555-4555-8555-555555555555')
      expect(resolvedSecond.rows[0].id).toBe('55555555-5555-4555-8555-555555555555')
      const row = await second.query(`SELECT filter, delay_minutes, enabled, sort_order, preset_key FROM lead_rule_destinations`)
      expect(row.rows).toEqual([{
        filter: { country: 'AU' }, delay_minutes: 15, enabled: false, sort_order: 7,
        preset_key: 'email_endpoint:portal:{}'
      }])
      const catalog = await second.query(`SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = 'uq_lead_rule_destinations_preset_key'`, [schema])
      expect(catalog.rowCount).toBe(1)
      await expect(second.query(`
        INSERT INTO lead_email_endpoint_audits(endpoint_id, client_id, actor_id, action, after_state)
        VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'created', '{"address_token":"forbidden"}'::jsonb)
      `)).rejects.toMatchObject({ code: '23514' })
    } finally {
      await first.query('ROLLBACK').catch(() => {})
      first.release()
      second.release()
    }
  }, 30_000)
})
