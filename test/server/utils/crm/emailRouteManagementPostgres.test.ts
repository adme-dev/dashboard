import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { rotateCrmLeadInboxRoute } from '~~/server/utils/crm/emailRouteManagement'

const databaseUrl = process.env.CRM_EMAIL_ROUTE_TEST_DATABASE_URL
const describePostgres = databaseUrl ? describe : describe.skip
const migration = readFileSync(
  new URL('../../../../server/database/migrations/326_crm_email_route_management.sql', import.meta.url),
  'utf8'
)

function directDatabaseUrl(value: string) {
  const url = new URL(value)
  url.hostname = url.hostname.replace('-pooler.', '.')
  return url.toString()
}

describePostgres('CRM email route rotation on isolated Postgres', () => {
  const schema = `crm_email_route_rotation_${randomUUID().replaceAll('-', '')}`
  let pool: pg.Pool

  async function withSchemaClient<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO ${schema}, public`)
      return await callback(client)
    } finally {
      client.release()
    }
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: directDatabaseUrl(databaseUrl!) })
    await withSchemaClient(async (client) => {
      await client.query(`CREATE SCHEMA ${schema}`)
      await client.query(`SET search_path TO ${schema}, public`)
      await client.query(`
        CREATE TABLE agency_clients (
          id UUID PRIMARY KEY,
          lead_capture_mode TEXT NOT NULL
        );
        CREATE TABLE team_members (
          id UUID PRIMARY KEY,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          user_role TEXT NOT NULL DEFAULT 'member'
        );
        CREATE TABLE client_team_assignments (
          client_id UUID NOT NULL REFERENCES agency_clients(id),
          team_member_id UUID NOT NULL REFERENCES team_members(id)
        );
        CREATE TABLE crm_email_routes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
          conversation_id UUID,
          route_kind TEXT NOT NULL CHECK (route_kind IN ('lead_inbox', 'conversation_reply')),
          token_version INTEGER NOT NULL CHECK (token_version > 0),
          route_token_hash TEXT NOT NULL UNIQUE CHECK (route_token_hash ~ '^[a-f0-9]{64}$'),
          recipient_domain TEXT NOT NULL,
          expires_at TIMESTAMPTZ,
          last_used_at TIMESTAMPTZ,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          revoked_at TIMESTAMPTZ,
          CHECK ((route_kind = 'lead_inbox' AND conversation_id IS NULL)
            OR (route_kind = 'conversation_reply' AND conversation_id IS NOT NULL)),
          CHECK (revoked_at IS NULL OR is_active = FALSE)
        );
      `)
      await client.query(migration)
    })
  }, 30_000)

  beforeEach(async () => {
    await withSchemaClient(async (client) => {
      await client.query(`
        DROP TRIGGER IF EXISTS force_crm_route_activation_failure ON crm_email_routes;
        DROP TRIGGER IF EXISTS force_crm_route_audit_failure ON crm_email_route_audits;
        DROP FUNCTION IF EXISTS force_crm_route_activation_failure();
        DROP FUNCTION IF EXISTS force_crm_route_audit_failure();
      `)
      await client.query('TRUNCATE crm_email_route_audits, crm_email_routes, client_team_assignments, team_members, agency_clients')
    })
  })

  afterAll(async () => {
    await withSchemaClient(async (client) => {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    })
    await pool.end()
  })

  async function seedActiveRoute() {
    const clientId = randomUUID()
    const actorId = randomUUID()
    const routeId = randomUUID()
    await withSchemaClient(async (client) => {
      await client.query(`INSERT INTO agency_clients (id, lead_capture_mode) VALUES ($1, 'full_crm')`, [clientId])
      await client.query(`INSERT INTO team_members (id, is_active, user_role) VALUES ($1, TRUE, 'admin')`, [actorId])
      await client.query(`
        INSERT INTO crm_email_routes (
          id, client_id, conversation_id, route_kind, token_version,
          route_token_hash, recipient_domain, label, created_by
        ) VALUES ($1, $2, NULL, 'lead_inbox', 7, repeat('a', 64), 'inbound.test.invalid', 'Synthetic route', $3)
      `, [routeId, clientId, actorId])
    })
    return { clientId, actorId, routeId }
  }

  function rotationDependencies(inspection: {
    oldWasActiveWhenReplacementInserted?: boolean
    replacementWasInitiallyInactive?: boolean
  }) {
    return {
      emailConversationsEnabled: () => true,
      createToken: async () => ({
        token: 'synthetic-token-not-persisted',
        routeTokenHash: 'b'.repeat(64)
      }),
      transaction: async <T>(callback: (db: { query: pg.PoolClient['query'] }) => Promise<T>): Promise<T> => {
        return await withSchemaClient(async (client) => {
          await client.query('BEGIN')
          try {
            const db = {
              query: async (...args: Parameters<pg.PoolClient['query']>) => {
                const [sql] = args
                const result = await client.query(...args)
                if (/INSERT INTO crm_email_routes/.test(String(sql))) {
                  const replacementId = result.rows[0]?.id as string | undefined
                  const states = await client.query<{ id: string, is_active: boolean }>(`
                    SELECT id, is_active
                    FROM crm_email_routes
                    ORDER BY created_at ASC, id ASC
                  `)
                  inspection.oldWasActiveWhenReplacementInserted = states.rows.some(row => row.is_active && row.id !== replacementId)
                  inspection.replacementWasInitiallyInactive = states.rows.find(row => row.id === replacementId)?.is_active === false
                }
                return result
              }
            }
            const result = await callback(db)
            await client.query('COMMIT')
            return result
          } catch (error) {
            await client.query('ROLLBACK')
            throw error
          }
        })
      }
    }
  }

  function rotate(input: { clientId: string, actorId: string, routeId: string }) {
    const inspection: { oldWasActiveWhenReplacementInserted?: boolean, replacementWasInitiallyInactive?: boolean } = {}
    return {
      inspection,
      result: rotateCrmLeadInboxRoute({
        clientId: input.clientId,
        routeId: input.routeId,
        actor: { id: input.actorId, type: 'team_member' },
        issuance: {
          currentVersion: 7,
          domain: 'inbound.test.invalid',
          secret: 'synthetic-secret-not-persisted'
        }
      }, rotationDependencies(inspection) as never)
    }
  }

  async function forceLateFailure(failurePoint: 'activation' | 'audit') {
    await withSchemaClient(async (client) => {
      if (failurePoint === 'activation') {
        await client.query(`
          CREATE FUNCTION force_crm_route_activation_failure()
          RETURNS TRIGGER LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'forced activation failure'; END;
          $$;
          CREATE TRIGGER force_crm_route_activation_failure
          BEFORE UPDATE OF is_active ON crm_email_routes
          FOR EACH ROW
          WHEN (NEW.is_active = TRUE AND OLD.is_active = FALSE)
          EXECUTE FUNCTION force_crm_route_activation_failure();
        `)
        return
      }
      await client.query(`
        CREATE FUNCTION force_crm_route_audit_failure()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'forced audit failure'; END;
        $$;
        CREATE TRIGGER force_crm_route_audit_failure
        BEFORE INSERT ON crm_email_route_audits
        FOR EACH ROW EXECUTE FUNCTION force_crm_route_audit_failure();
      `)
    })
  }

  it('rotates with one active route and proves the replacement was inserted inactive under the partial index', async () => {
    const input = await seedActiveRoute()
    const rotation = rotate(input)

    const issued = await rotation.result
    const state = await withSchemaClient(client => client.query<{
      id: string
      is_active: boolean
      revoked_reason: string | null
      replaced_by_route_id: string | null
    }>(`
      SELECT id, is_active, revoked_reason, replaced_by_route_id
      FROM crm_email_routes
      ORDER BY created_at ASC, id ASC
    `))
    const active = state.rows.filter(route => route.is_active)
    const old = state.rows.find(route => route.id === input.routeId)
    const audit = await withSchemaClient(client => client.query<{ action: string }>(`
      SELECT action FROM crm_email_route_audits ORDER BY created_at ASC, id ASC
    `))

    expect(rotation.inspection).toEqual({
      oldWasActiveWhenReplacementInserted: true,
      replacementWasInitiallyInactive: true
    })
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe(issued.route.id)
    expect(old).toMatchObject({
      is_active: false,
      revoked_reason: 'rotated',
      replaced_by_route_id: issued.route.id
    })
    expect(audit.rows).toEqual([{ action: 'rotated' }])
  })

  it.each(['activation', 'audit'] as const)(
    'rolls back persisted replacement, old-route revocation, and audit when %s fails late',
    async (failurePoint) => {
      const input = await seedActiveRoute()
      await forceLateFailure(failurePoint)
      const rotation = rotate(input)

      await expect(rotation.result).rejects.toThrow(`forced ${failurePoint} failure`)
      const routes = await withSchemaClient(client => client.query<{
        id: string
        is_active: boolean
        revoked_at: Date | null
      }>('SELECT id, is_active, revoked_at FROM crm_email_routes ORDER BY created_at ASC, id ASC'))
      const audits = await withSchemaClient(client => client.query('SELECT id FROM crm_email_route_audits'))

      expect(rotation.inspection).toEqual({
        oldWasActiveWhenReplacementInserted: true,
        replacementWasInitiallyInactive: true
      })
      expect(routes.rows).toEqual([{
        id: input.routeId,
        is_active: true,
        revoked_at: null
      }])
      expect(audits.rows).toEqual([])
    }
  )
})
