import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('server/database/migrations/234_monday_reconciliation_state.sql', 'utf8')
const processor = readFileSync('server/api/cron/monday-webhooks.post.ts', 'utf8')
const migrationService = readFileSync('server/utils/mondayMigration.ts', 'utf8')
const syncStatus = readFileSync('server/api/agency/hr/monday/sync-status.get.ts', 'utf8')
const dashboard = readFileSync('app/pages/agency/hr/monday/import.vue', 'utf8')

describe('Monday webhook reconciliation contract', () => {
  it('adds typed source and reconciliation state with a scoped lookup index', () => {
    expect(migration).toContain('source_state')
    expect(migration).toContain('reconciliation_status')
    expect(migration).toContain('source_updated_at')
    expect(migration).toContain('last_seen_at')
    expect(migration).toContain('last_webhook_event_id')
    expect(migration).toContain('idx_monday_item_mappings_reconciliation')
    expect(migration).toContain("WHERE archived = true")
  })

  it('updates only the latest mapping and never falsifies the local task timestamp', () => {
    expect(processor).toContain('classifyMondayWebhookEvent')
    expect(processor).toContain('event_type AS "eventType"')
    expect(processor).toContain('received_at AS "receivedAt"')
    expect(processor).toContain('reconciliation_status')
    expect(processor).toContain('last_webhook_event_id')
    expect(processor).toContain('ORDER BY created_at DESC, updated_at DESC')
    expect(processor).toContain('last_seen_at IS NULL OR last_seen_at < $4::timestamptz')
    expect(processor).toContain('source_updated_at IS NULL OR source_updated_at <= $4::timestamptz')
    expect(processor).not.toContain('UPDATE tasks SET updated_at')
  })

  it('marks fetched Monday items current using their exact source timestamp', () => {
    expect(migrationService).toContain('source_state')
    expect(migrationService).toContain('source_updated_at')
    expect(migrationService).toContain("'current'")
    expect(migrationService).toContain('item.updated_at')
  })

  it('exposes scoped drift counts on the independently scrollable owner dashboard', () => {
    expect(syncStatus).toContain('getMondayReconciliationSummary')
    expect(syncStatus).toContain('states, reconciliation')
    expect(dashboard).toContain('Reconciliation health')
    expect(dashboard).toContain('Pending source changes')
    expect(dashboard).toContain('Archived in Monday')
    expect(dashboard).toContain('Deleted in Monday')
    expect(dashboard).toContain('h-full min-h-0 overflow-y-auto')
  })
})
