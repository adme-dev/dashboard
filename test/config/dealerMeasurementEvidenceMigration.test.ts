import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/407_dealer_measurement_evidence.sql', import.meta.url),
  'utf8'
)

describe('dealer measurement evidence migration', () => {
  it('stores event, stage, and replay evidence in tenant-scoped append-only tables', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS measurement_evidence_events')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS measurement_evidence_stages')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS measurement_evidence_nonces')
    expect(migration).toMatch(/UNIQUE \(client_id, source_system, source_event_id\)/)
    expect(migration).toMatch(/FOREIGN KEY \(client_id, endpoint_id\)/)
    expect(migration).toContain('prevent_measurement_evidence_mutation')
  })

  it('keeps server delivery disabled and dedup validation fail-closed by default', () => {
    expect(migration).toContain('allow_server_delivery BOOLEAN NOT NULL DEFAULT FALSE')
    expect(migration).toContain('browser_server_dedup_validated BOOLEAN NOT NULL DEFAULT FALSE')
  })
})
