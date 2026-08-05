import { describe, expect, it, vi } from 'vitest'

import { withDisposablePostgresSchema } from '../utils/disposablePostgresSchema'

describe('disposable Postgres schema harness', () => {
  it('pins setup to one transaction and always rolls back, drops, and closes after failure', async () => {
    const calls: string[] = []
    const client = {
      connect: vi.fn(async () => undefined),
      query: vi.fn(async (sql: string) => {
        calls.push(sql)
        if (sql.includes('current_schema()')) return { rows: [{ schema: 'memory_outbox_test_abc123' }] }
        return { rows: [] }
      }),
      end: vi.fn(async () => undefined)
    }

    await expect(withDisposablePostgresSchema({
      client,
      schema: 'memory_outbox_test_abc123',
      bootstrapSql: 'CREATE TABLE "memory_outbox_test_abc123".ai_user_memory (id UUID PRIMARY KEY)',
      migrationSql: 'CREATE TABLE IF NOT EXISTS ai_memory_index_outbox (id UUID PRIMARY KEY)',
      run: async () => { throw new Error('assertion failed') }
    })).rejects.toThrow('assertion failed')

    expect(calls).toEqual([
      'CREATE SCHEMA "memory_outbox_test_abc123"',
      'BEGIN',
      'SET LOCAL search_path TO "memory_outbox_test_abc123", pg_catalog',
      'SELECT current_schema() AS schema',
      'CREATE TABLE "memory_outbox_test_abc123".ai_user_memory (id UUID PRIMARY KEY)',
      'CREATE TABLE IF NOT EXISTS ai_memory_index_outbox (id UUID PRIMARY KEY)',
      'CREATE TABLE IF NOT EXISTS ai_memory_index_outbox (id UUID PRIMARY KEY)',
      'ROLLBACK',
      'DROP SCHEMA IF EXISTS "memory_outbox_test_abc123" CASCADE'
    ])
    expect(client.end).toHaveBeenCalledTimes(1)
  })

  it('rejects an unsafe schema name before connecting', async () => {
    const client = { connect: vi.fn(), query: vi.fn(), end: vi.fn() }
    await expect(withDisposablePostgresSchema({
      client,
      schema: 'public; DROP SCHEMA public',
      bootstrapSql: '',
      migrationSql: '',
      run: async () => undefined
    })).rejects.toThrow(/invalid disposable schema/i)
    expect(client.connect).not.toHaveBeenCalled()
  })

  it('snapshots shared state before setup and verifies it after cleanup on the same connection', async () => {
    const calls: string[] = []
    const client = {
      connect: vi.fn(async () => undefined),
      query: vi.fn(async (sql: string) => {
        calls.push(sql)
        if (sql === 'SNAPSHOT PUBLIC') return { rows: [{ name: 'existing' }] }
        if (sql.includes('current_schema()')) return { rows: [{ schema: 'memory_outbox_test_snapshot' }] }
        return { rows: [] }
      }),
      end: vi.fn(async () => undefined)
    }
    await withDisposablePostgresSchema({
      client, schema: 'memory_outbox_test_snapshot', bootstrapSql: 'BOOTSTRAP', migrationSql: 'MIGRATE',
      snapshotSharedState: connection => connection.query('SNAPSHOT PUBLIC'),
      verifySharedState: async (connection, before) => {
        expect((await connection.query('SNAPSHOT PUBLIC')).rows).toEqual((before as any).rows)
      },
      run: async () => undefined
    })
    expect(calls.indexOf('SNAPSHOT PUBLIC')).toBeLessThan(calls.indexOf('CREATE SCHEMA "memory_outbox_test_snapshot"'))
    expect(calls.lastIndexOf('SNAPSHOT PUBLIC')).toBeGreaterThan(calls.indexOf('DROP SCHEMA IF EXISTS "memory_outbox_test_snapshot" CASCADE'))
  })
})
