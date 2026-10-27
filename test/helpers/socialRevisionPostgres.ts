// Disposable local PostgreSQL harness for the Task 3 delegated social review tests.
//
// Guarded like the CRM search harness: only an isolated Unix-socket database whose name starts with
// `social_task3_` is accepted, so these tests can never reach a shared, hosted or production database.
// The fixture schema is the minimal set of upstream tables the code under test reads, plus the REAL
// social migrations (145 social_posts, 216 audit, 217 publish targets, 255 portal approvals and 483
// revision review) so constraints and triggers are exercised exactly as written.
import { readFileSync } from 'node:fs'
import { Pool, type PoolClient } from 'pg'

export const SOCIAL_TASK3_DSN = process.env.SOCIAL_TASK3_TEST_DSN?.trim() || ''

/**
 * Schema that models a stale cached binding (production `HYPERDRIVE`): the cached pool resolves table
 * names through it first, so a table snapshotted there keeps returning the old rows while the fresh pool
 * (`HYPERDRIVE_FRESH`, transactions) sees the live table.
 */
export const SOCIAL_TASK3_CACHE_SCHEMA = 'task3_cache'

export function guardedSocialTask3Pool(raw: string, options: { cached?: boolean } = {}): Pool {
  const url = new URL(raw)
  const host = url.searchParams.get('host') ?? ''
  const database = url.pathname.replace(/^\//, '')
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Task 3 tests require PostgreSQL')
  if (url.hostname !== 'localhost' || url.port !== '' || url.password) throw new Error('Task 3 tests reject TCP/remote/credentialed targets')
  if (!host.startsWith('/private/tmp/') || host.includes('..')) throw new Error('Task 3 tests require an isolated private Unix socket')
  if (!/^social_task3_[a-z0-9_]{2,60}$/.test(database) || /(prod|production|main|primary|shared)/i.test(database)) {
    throw new Error('Task 3 tests require an isolated social_task3_* database')
  }
  return new Pool({
    host,
    database,
    user: url.username || undefined,
    max: 6,
    statement_timeout: 10_000,
    ...(options.cached ? { options: `-c search_path=${SOCIAL_TASK3_CACHE_SCHEMA},public` } : {})
  })
}

/** Freeze the current rows of `table` as what the cached binding keeps returning. */
export async function freezeCachedTable(pool: Pool, table: 'social_accounts'): Promise<void> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SOCIAL_TASK3_CACHE_SCHEMA}`)
  await pool.query(`DROP TABLE IF EXISTS ${SOCIAL_TASK3_CACHE_SCHEMA}.${table}`)
  await pool.query(`CREATE TABLE ${SOCIAL_TASK3_CACHE_SCHEMA}.${table} AS SELECT * FROM public.${table}`)
}

export async function clearCachedTables(pool: Pool): Promise<void> {
  await pool.query(`DROP SCHEMA IF EXISTS ${SOCIAL_TASK3_CACHE_SCHEMA} CASCADE`)
}

const FIXTURE_SQL = `
DROP SCHEMA IF EXISTS task3_cache CASCADE;
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
CREATE TABLE agency_clients (id UUID PRIMARY KEY, name TEXT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE custom_roles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, is_system BOOLEAN NOT NULL DEFAULT FALSE, is_read_only BOOLEAN NOT NULL DEFAULT FALSE);
CREATE TABLE role_permission_groups (role_id UUID NOT NULL, permission_group TEXT NOT NULL);
CREATE TABLE team_members (id UUID PRIMARY KEY, name TEXT, email TEXT, role TEXT, user_role TEXT, custom_role_id UUID, is_active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE client_team_assignments (team_member_id UUID NOT NULL, client_id UUID NOT NULL);
CREATE TABLE social_accounts (
  id UUID PRIMARY KEY, client_id UUID NOT NULL, platform TEXT NOT NULL, platform_account_id TEXT NOT NULL,
  access_token TEXT NOT NULL DEFAULT 'token', refresh_token TEXT, token_expires_at TIMESTAMPTZ, account_name TEXT,
  last_error TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE banner_assets (
  id UUID PRIMARY KEY, name VARCHAR(255) NOT NULL, mime_type VARCHAR(100) NOT NULL, file_size INTEGER NOT NULL,
  r2_key TEXT NOT NULL, url TEXT NOT NULL, thumbnail_url TEXT, tags TEXT[], uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(), client_id UUID);
CREATE TABLE video_assets (
  id UUID PRIMARY KEY, client_id UUID, created_by UUID NOT NULL, title TEXT, source_project_id UUID, source_job_id UUID,
  r2_key TEXT NOT NULL, format TEXT NOT NULL DEFAULT '16:9', width INT, height INT, duration_sec NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), thumbnail_key TEXT,
  caption_vtt_key TEXT, transcript TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE social_content_packages (id UUID PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE social_content_package_versions (
  id UUID PRIMARY KEY, package_id UUID REFERENCES social_content_packages(id), version INTEGER NOT NULL DEFAULT 1,
  commercial_scope JSONB NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE social_content_package_assignments (
  id UUID PRIMARY KEY, client_id UUID NOT NULL, package_version_id UUID NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE, ends_on DATE, commercial_scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE social_news_items (id UUID PRIMARY KEY, title TEXT, source_url TEXT, author TEXT, published_at TIMESTAMPTZ);
CREATE TABLE social_news_feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID, news_item_id UUID, post_id UUID, actor_id TEXT,
  event_type TEXT, metadata JSONB);
CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID NOT NULL, name TEXT);
CREATE TABLE social_news_autopost_rules (id UUID PRIMARY KEY, client_id UUID NOT NULL, account_id UUID, mode TEXT NOT NULL DEFAULT 'review');
CREATE TABLE client_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_user_id UUID, client_id UUID, action TEXT, entity_type TEXT,
  entity_id UUID, details JSONB);
CREATE TABLE god_mode_execution_ledger (
  actor_user_id UUID NOT NULL, channel VARCHAR(16) NOT NULL, idempotency_key VARCHAR(128) NOT NULL,
  state VARCHAR(16) NOT NULL, result_reference VARCHAR(128), result_digest VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  correlation_id UUID NOT NULL, route_or_tool VARCHAR(160) NOT NULL, executor_class VARCHAR(32) NOT NULL,
  session_digest VARCHAR(64) NOT NULL, tenant_id UUID, client_id UUID, proposal_id UUID,
  execution_phase VARCHAR(32) NOT NULL DEFAULT 'claimed', execution_metadata JSONB,
  PRIMARY KEY (actor_user_id, channel, idempotency_key),
  CHECK (state IN ('in_progress', 'succeeded', 'failed', 'ambiguous')),
  CHECK (executor_class IN ('local-transactional', 'internal-http', 'external-provider')),
  CHECK (execution_phase IN ('claimed', 'proposal_prepared', 'task_created', 'dispatched', 'result_captured')));
`

const MIGRATIONS = [
  'server/database/migrations/145_social_posts.sql',
  'server/database/migrations/216_social_publishing_audit_events.sql',
  'server/database/migrations/217_social_post_publish_targets.sql',
  'server/database/migrations/255_social_news_portal_approvals.sql',
  'server/database/migrations/483_social_post_revision_review.sql',
  'server/database/migrations/486_tiktok_publish_reconciliation.sql',
  'server/database/migrations/487_tiktok_opaque_publish_id.sql',
  'server/database/migrations/488_social_target_initial_receipts.sql',
  'server/database/migrations/489_social_first_comment_receipts.sql'
]

export async function resetSocialTask3Schema(pool: Pool): Promise<void> {
  await pool.query('SET client_min_messages = warning')
  await pool.query(FIXTURE_SQL)
  for (const file of MIGRATIONS) await pool.query(readFileSync(file, 'utf8'))
  // Columns added by later migrations (200 campaigns, planner/assignment work) that exist in the live
  // schema recorded by migration-schema-preflight.json.
  await pool.query(`
    CREATE TABLE social_campaigns (id UUID PRIMARY KEY, client_id UUID NOT NULL, name TEXT NOT NULL DEFAULT 'Campaign');
    ALTER TABLE social_posts
      ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES social_campaigns(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS assigned_to TEXT,
      ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;`)
}

/**
 * db-module adapter backed by the pool: separate connections, so row locks are real. Cached reads
 * (`queryRows`/`queryOne`) go through `cachedPool` when given, fresh reads, writes and transactions
 * through `pool`, mirroring the production HYPERDRIVE / HYPERDRIVE_FRESH split.
 */
export function socialTask3DbModule(pool: Pool, cachedPool: Pool = pool) {
  const queryRowsFresh = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params as any[])).rows
  const queryOneFresh = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params as any[])).rows[0] ?? null
  const queryRows = async (sql: string, params: unknown[] = []) => (await cachedPool.query(sql, params as any[])).rows
  const queryOne = async (sql: string, params: unknown[] = []) => (await cachedPool.query(sql, params as any[])).rows[0] ?? null
  const execute = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params as any[])).rowCount ?? 0
  const transaction = async <T>(callback: (db: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }
  return {
    queryRows,
    queryRowsFresh,
    queryOne,
    queryOneFresh,
    execute,
    transaction,
    transactionWithoutRetry: transaction,
    transactionOnce: transaction
  }
}
