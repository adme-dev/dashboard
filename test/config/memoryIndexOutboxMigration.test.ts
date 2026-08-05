import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { withDisposablePostgresSchema } from '../utils/disposablePostgresSchema'

const databaseUrl = process.env.MEMORY_INDEX_OUTBOX_TEST_DATABASE_URL
const schema = `memory_outbox_test_${crypto.randomUUID().replaceAll('-', '')}`

describe('memory index outbox migration', () => {
  it('is additive, deduplicates by memory, and exposes a retry claim index', () => {
    const sql = readFileSync('server/database/migrations/348_ai_memory_index_outbox.sql', 'utf8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ai_memory_index_outbox')
    expect(sql).toMatch(/memory_id UUID NOT NULL UNIQUE/)
    expect(sql).toContain("status IN ('pending', 'processing')")
    expect(sql).toContain('next_attempt_at')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_ai_memory_index_outbox_claim')
    expect(sql).not.toMatch(/\bcontent\s+TEXT\b/)
  })

  it('schedules the authenticated consumer without making indexing part of the request transaction', () => {
    const worker = readFileSync('workers/pages-cron/src/index.ts', 'utf8')
    const endpoint = readFileSync('server/api/cron/memory-index-outbox.post.ts', 'utf8')
    expect(worker).toContain("'/api/cron/memory-index-outbox'")
    expect(endpoint).toContain("getHeader(event, 'x-cron-secret')")
    expect(endpoint).toContain('processMemoryIndexOutbox')
  })
})

const databaseDescribe = databaseUrl ? describe.sequential : describe.skip

databaseDescribe('memory index outbox disposable-schema regression', () => {
  it('applies twice in one pinned transaction and confines every object to the disposable schema', async () => {
    const client = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 10_000,
      query_timeout: 15_000,
      statement_timeout: 15_000
    })
    const sql = readFileSync('server/database/migrations/348_ai_memory_index_outbox.sql', 'utf8')
    await withDisposablePostgresSchema({
      client,
      schema,
      bootstrapSql: `CREATE TABLE "${schema}".ai_user_memory (id UUID PRIMARY KEY)`,
      migrationSql: sql,
      run: async connection => {
        const selected = await connection.query('SELECT current_schema() AS schema')
        expect(selected.rows).toEqual([{ schema }])

        const outboxSchema = await connection.query(
          `SELECT namespace.nspname AS schema
             FROM pg_catalog.pg_class relation
             JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
            WHERE relation.oid = to_regclass('ai_memory_index_outbox')`
        )
        expect(outboxSchema.rows).toEqual([{ schema }])
        const publicOutbox = await connection.query(
          `SELECT to_regclass('public.ai_memory_index_outbox')::text AS regclass`
        )
        expect(publicOutbox.rows).toEqual([{ regclass: null }])

        const memoryId = '11111111-1111-4111-8111-111111111111'
        await connection.query(`INSERT INTO "${schema}".ai_user_memory (id) VALUES ($1)`, [memoryId])
        await connection.query(
          `INSERT INTO "${schema}".ai_memory_index_outbox (memory_id) VALUES ($1)`,
          [memoryId]
        )
        await connection.query('SAVEPOINT duplicate_memory_job')
        try {
          await expect(connection.query(
            `INSERT INTO "${schema}".ai_memory_index_outbox (memory_id) VALUES ($1)`,
            [memoryId]
          )).rejects.toThrow()
        } finally {
          await connection.query('ROLLBACK TO SAVEPOINT duplicate_memory_job')
          await connection.query('RELEASE SAVEPOINT duplicate_memory_job')
        }
        const jobs = await connection.query(
          `SELECT COUNT(*)::int AS count FROM "${schema}".ai_memory_index_outbox WHERE memory_id = $1`,
          [memoryId]
        )
        expect(jobs.rows).toEqual([{ count: 1 }])
      }
    })
  }, 30_000)
})
