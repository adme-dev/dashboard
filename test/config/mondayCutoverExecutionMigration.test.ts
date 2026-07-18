import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../../server/database/migrations/264_monday_cutover_execution_runs.sql', import.meta.url)

describe('Monday cutover execution migration', () => {
  it('creates exact, idempotent run and item journals with structural provenance protection', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS monday_cutover_execution_runs')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS monday_cutover_execution_items')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_monday_provenance')
    expect(sql).toContain('(monday_board_id, monday_item_id)')
    expect(sql).toContain('idempotency_key')
    expect(sql).toContain('client_column_value_id')
    expect(sql).toContain('client_column_id')
    expect(sql).toContain(`status IN ('prepared', 'executing', 'completed', 'rollback_pending')`)
  })

  it('provides a catalog-driven guard against deleting related task content', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('monday_cutover_tasks_have_external_dependencies')
    expect(sql).toContain('FROM pg_catalog.pg_constraint')
    expect(sql).toContain('referenced.relname = \'tasks\'')
    expect(sql).toContain('constraint_record.contype = \'f\'')
    expect(sql).toContain('format(')
  })

  it('keeps execution audit evidence append-only', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS monday_cutover_execution_audit')
    expect(sql).toContain('prevent_monday_cutover_execution_audit_mutation')
    expect(sql).toContain('BEFORE UPDATE OR DELETE')
  })
})
