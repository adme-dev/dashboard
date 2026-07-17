import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/257_measurement_destination_connection_tenant.sql',
  import.meta.url
)

describe('Measurement destination connection tenant migration 257', () => {
  it('adds and validates a database-level composite tenant foreign key', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('uq_social_connections_client_id_id')
    expect(migration).toMatch(/ON social_connections \(client_id, id\)/)
    expect(migration).toContain('fk_conversion_destinations_social_connection_tenant')
    expect(migration).toMatch(/FOREIGN KEY \(client_id, social_connection_id\)/)
    expect(migration).toMatch(/REFERENCES social_connections \(client_id, id\)/)
    expect(migration).toContain('NOT VALID')
    expect(migration).toContain(
      'VALIDATE CONSTRAINT fk_conversion_destinations_social_connection_tenant'
    )
    expect(migration).toContain('COMMIT;')
  })
})
