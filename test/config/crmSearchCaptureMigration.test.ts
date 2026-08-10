import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CRM_SEARCH_INSTALLATION_SCOPE_ID = '00000000-0000-4351-8351-000000000001'

const migrationPath = new URL(
  '../../server/database/migrations/352_crm_search_activate_capture.sql',
  import.meta.url
)

function readMigration(): string {
  return readFileSync(migrationPath, 'utf8')
}

function functionDefinition(sql: string, name: string): string {
  const match = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION ${name}\\([\\s\\S]*?\\$\\$;`,
    'i'
  ))
  expect(match, `${name} definition is missing`).not.toBeNull()
  return match![0]
}

describe('CRM search capture migration 352', () => {
  it('is fenced, timeout-bounded, and installs/verifies capture triggers last in one transaction', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readMigration()

    expect(sql.trimStart()).toMatch(/^BEGIN;/)
    expect(sql.trimEnd()).toMatch(/COMMIT;$/)
    expect(sql).toContain('SET LOCAL lock_timeout = \'5s\'')
    expect(sql).toContain('SET LOCAL statement_timeout = \'60s\'')
    expect(sql).toMatch(/pg_advisory_xact_lock[\s\S]*crm-search-migration-352/i)
    expect(sql).toMatch(/LOCK TABLE[\s\S]*agency_clients[\s\S]*crm_people[\s\S]*crm_companies[\s\S]*crm_opportunities/i)

    const lastFunction = sql.lastIndexOf('CREATE OR REPLACE FUNCTION')
    const firstCaptureTrigger = sql.indexOf('CREATE TRIGGER crm_search_capture_')
    const verification = sql.lastIndexOf('pg_get_triggerdef')
    expect(firstCaptureTrigger).toBeGreaterThan(lastFunction)
    expect(verification).toBeGreaterThan(firstCaptureTrigger)
    expect(sql.slice(verification)).toMatch(/RAISE EXCEPTION[\s\S]*trigger installation.*mismatch/i)
  })

  it.each([
    ['person', 'crm_people'],
    ['company', 'crm_companies'],
    ['opportunity', 'crm_opportunities']
  ])('uses a source-specific, pinned SECURITY DEFINER function for %s', (entity, table) => {
    const sql = readMigration()
    const name = `crm_search_capture_${entity}_change`
    const definition = functionDefinition(sql, name)

    expect(definition).toContain('SECURITY DEFINER')
    expect(definition).toMatch(/SET search_path = pg_catalog, pg_temp/)
    expect(definition).toContain(CRM_SEARCH_INSTALLATION_SCOPE_ID)
    expect(definition).toContain('crm_search_client_advisory_lock_key')
    expect(definition).toContain('pg_advisory_xact_lock_shared')
    expect(definition).toContain('crm_search_record_source_intent')
    expect(sql).toMatch(new RegExp(
      `CREATE TRIGGER ${name}[\\s\\S]*BEFORE INSERT OR UPDATE OR DELETE ON ${table}[\\s\\S]*EXECUTE FUNCTION ${name}\\(\\)`,
      'i'
    ))
  })

  it('owns insert/update/delete revisions and ignores application-supplied revision values', () => {
    const sql = readMigration()

    for (const entity of ['person', 'company', 'opportunity']) {
      const definition = functionDefinition(sql, `crm_search_capture_${entity}_change`)
      expect(definition).toMatch(/TG_OP = 'INSERT'[\s\S]*NEW\.search_revision := 1/i)
      expect(definition).toMatch(/TG_OP = 'UPDATE'[\s\S]*NEW\.search_revision := OLD\.search_revision \+ 1/i)
      expect(definition).toMatch(/NOT v_search_relevant[\s\S]*NEW\.search_revision := OLD\.search_revision/i)
      expect(definition).toMatch(/TG_OP = 'DELETE'[\s\S]*OLD\.search_revision \+ 1/i)
    }
    expect(sql).not.toMatch(/NEW\.search_revision\s*:=\s*COALESCE\(NEW\.search_revision/i)
  })

  it('increments only projection/client/deletion changes and maps soft delete, restore, and physical delete exactly', () => {
    const sql = readMigration()
    const person = functionDefinition(sql, 'crm_search_capture_person_change')
    const company = functionDefinition(sql, 'crm_search_capture_company_change')
    const opportunity = functionDefinition(sql, 'crm_search_capture_opportunity_change')

    for (const field of ['first_name', 'last_name', 'job_title', 'department', 'lifecycle_stage', 'client_id', 'deleted_at']) {
      expect(person).toContain(`OLD.${field}`)
      expect(person).toContain(`NEW.${field}`)
    }
    for (const field of ['name', 'domain', 'lifecycle_stage', 'client_id', 'deleted_at']) {
      expect(company).toContain(`OLD.${field}`)
      expect(company).toContain(`NEW.${field}`)
    }
    for (const field of ['name', 'status', 'source', 'client_id', 'deleted_at']) {
      expect(opportunity).toContain(`OLD.${field}`)
      expect(opportunity).toContain(`NEW.${field}`)
    }
    expect(sql).toMatch(/NEW\.deleted_at IS NULL[\s\S]*'upsert'[\s\S]*'delete'/i)
    expect(sql).toMatch(/TG_OP = 'DELETE'[\s\S]*'delete'/i)
  })

  it('takes OLD and NEW shared client locks in canonical UUID order and records dual move intent', () => {
    const sql = readMigration()

    for (const entity of ['person', 'company', 'opportunity']) {
      const definition = functionDefinition(sql, `crm_search_capture_${entity}_change`)
      expect(definition).toContain('OLD.client_id IS DISTINCT FROM NEW.client_id')
      expect(definition).toMatch(/LEAST\(OLD\.client_id, NEW\.client_id\)/i)
      expect(definition).toMatch(/GREATEST\(OLD\.client_id, NEW\.client_id\)/i)
      expect(definition).toMatch(
        /OLD\.client_id[\s\S]*'delete'[\s\S]*NEW\.client_id[\s\S]*'upsert'/i
      )
    }
  })

  it('writes only schema-neutral latest intent with monotonic revision/event CAS and resets stale claims', () => {
    const sql = readMigration()
    const intent = functionDefinition(sql, 'crm_search_record_source_intent')

    expect(intent).toMatch(/nextval\([^)]*crm_search_source_event_sequence/i)
    expect(intent).toMatch(/INSERT INTO (public\.)?crm_search_source_dirty/i)
    expect(intent).toMatch(/ON CONFLICT \(organisation_scope_id, client_id, entity_type, entity_id\)/i)
    expect(intent).toMatch(/EXCLUDED\.source_revision[\s\S]*EXCLUDED\.event_sequence[\s\S]*crm_search_source_dirty\.source_revision[\s\S]*crm_search_source_dirty\.event_sequence/i)
    expect(intent).toMatch(/claim_token\s*=\s*NULL[\s\S]*claim_lease_expires_at\s*=\s*NULL/i)
    expect(intent).not.toMatch(/crm_search_(policies|schema_versions|operations|documents)|provider|vectorize|workers_ai/i)
  })

  it('captures an independent teardown snapshot before deactivation or hard-delete cascades', () => {
    const sql = readMigration()
    const teardown = functionDefinition(sql, 'crm_search_capture_agency_client_teardown')

    expect(teardown).toContain('SECURITY DEFINER')
    expect(teardown).toMatch(/pg_advisory_xact_lock\s*\([\s\S]*crm_search_client_advisory_lock_key/i)
    expect(teardown).toMatch(/TG_OP = 'UPDATE'[\s\S]*OLD\.is_active IS TRUE[\s\S]*NEW\.is_active IS NOT TRUE/i)
    expect(teardown).toMatch(/TG_OP = 'DELETE'/i)
    expect(teardown).toMatch(/crm_search_client_teardowns/i)
    expect(teardown).toMatch(/crm_search_teardown_vectors/i)
    expect(teardown).toMatch(/crm_search_documents/i)
    expect(teardown).toMatch(/crm_search_operations/i)
    expect(teardown).toMatch(/ledger_manifest_hash/i)
    expect(teardown).toMatch(/lifecycle_state\s*=\s*'teardown_pending'[\s\S]*effective_mode\s*=\s*'off'[\s\S]*indexing_enabled\s*=\s*FALSE/i)
    expect(sql).toMatch(/CREATE TRIGGER crm_search_capture_agency_client_teardown[\s\S]*BEFORE UPDATE OR DELETE ON agency_clients/i)
  })

  it('installs exactly the three source triggers plus client teardown trigger and no activation/provider work', () => {
    const sql = readMigration()
    const names = sql.match(/CREATE TRIGGER (crm_search_capture_[a-z_]+)/gi) ?? []

    expect(names).toHaveLength(4)
    expect(new Set(names.map(name => name.toLowerCase()))).toEqual(new Set([
      'create trigger crm_search_capture_person_change',
      'create trigger crm_search_capture_company_change',
      'create trigger crm_search_capture_opportunity_change',
      'create trigger crm_search_capture_agency_client_teardown'
    ]))
    expect(sql).not.toMatch(/\b(fetch|http|vectorize|queue\.send|ai\.run)\s*\(/i)
    expect(sql).not.toMatch(/state\s*=\s*'enabled'|maximum_mode\s*=\s*'(shadow|assist)'|indexing_ready\s*=\s*TRUE/i)
  })
})
