import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const databaseUrl = process.env.MEMORY_INDEX_OUTBOX_TEST_DATABASE_URL
const schema = `memory_outbox_test_${crypto.randomUUID().replaceAll('-', '')}`
let client: Client | undefined

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
  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl })
    await client.connect()
    await client.query(`CREATE SCHEMA ${schema}`)
    await client.query(`SET search_path TO ${schema}, pg_catalog`)
    await client.query('CREATE TABLE ai_user_memory (id UUID PRIMARY KEY)')
    const sql = readFileSync('server/database/migrations/348_ai_memory_index_outbox.sql', 'utf8')
    await client.query(sql)
    await client.query(sql)
  })

  afterAll(async () => {
    if (!client) return
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await client.end()
  })

  it('applies twice and enforces one durable job per memory', async () => {
    const memoryId = '11111111-1111-4111-8111-111111111111'
    await client!.query('INSERT INTO ai_user_memory (id) VALUES ($1)', [memoryId])
    await client!.query(
      `INSERT INTO ai_memory_index_outbox (memory_id) VALUES ($1)`,
      [memoryId]
    )
    await expect(client!.query(
      `INSERT INTO ai_memory_index_outbox (memory_id) VALUES ($1)`,
      [memoryId]
    )).rejects.toThrow()
  })
})
