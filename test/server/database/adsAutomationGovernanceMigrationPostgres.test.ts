// Runs migration 515 against a disposable LOCAL PostgreSQL database only:
//   ADS_GOVERNANCE_PG_URL=postgres://postgres@127.0.0.1:5432/ads_governance_test_x pnpm vitest run <this file>
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { describe, expect, it } from 'vitest'

const url = process.env.ADS_GOVERNANCE_PG_URL
const target = url ? new URL(url) : null
const allowed = !!target && ['127.0.0.1', 'localhost'].includes(target.hostname) && /^\/ads_governance_test_[a-z0-9_]+$/.test(target.pathname)
const migration = readFileSync('server/database/migrations/515_ads_automation_governance.sql', 'utf8')

const ids = {
  owner: '11111111-1111-4111-8111-111111111111',
  manager: '22222222-2222-4222-8222-222222222222',
  client: '33333333-3333-4333-8333-333333333333'
}

describe.skipIf(!allowed)('migration 515 ads automation governance (PostgreSQL)', () => {
  it('is idempotent, seeds an engaged kill switch, versions every rule change and keeps history append-only', async () => {
    const db = new pg.Client({ connectionString: url })
    await db.connect()
    const expectFailure = async (sql: string, params: unknown[], pattern: RegExp) => {
      await db.query('SAVEPOINT s')
      await expect(db.query(sql, params)).rejects.toThrow(pattern)
      await db.query('ROLLBACK TO SAVEPOINT s')
    }
    try {
      await db.query('BEGIN')
      await db.query(`CREATE TABLE IF NOT EXISTS team_members (id uuid PRIMARY KEY, is_active boolean DEFAULT true);
        CREATE TABLE IF NOT EXISTS agency_clients (id uuid PRIMARY KEY, is_active boolean DEFAULT true);
        INSERT INTO team_members (id) VALUES ('${ids.owner}'), ('${ids.manager}') ON CONFLICT DO NOTHING;
        INSERT INTO agency_clients (id) VALUES ('${ids.client}') ON CONFLICT DO NOTHING`)
      // Migration carries its own BEGIN/COMMIT; strip them to keep the whole test in one rollback.
      const body = migration.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '')
      await db.query(body)
      await db.query(body)

      const controls = (await db.query('SELECT * FROM ads_automation_controls')).rows
      expect(controls).toHaveLength(1)
      expect(controls[0]).toMatchObject({ id: 'global', kill_switch_engaged: true, max_changes_per_account_per_day: 10, business_timezone: 'Australia/Melbourne' })
      await expectFailure('INSERT INTO ads_automation_controls (id) VALUES ($1)', ['other'], /check constraint/)

      const rule = (await db.query(`INSERT INTO ads_automation_rules (client_id, family, risk_tier, mode, owner_user_id, expires_at, created_by, updated_by, change_reason)
        VALUES ($1,'negative_keywords','low','draft',$2,NOW() + INTERVAL '30 days',$3,$3,'create') RETURNING id, version`, [ids.client, ids.owner, ids.manager])).rows[0]
      expect(rule.version).toBe(1)
      await db.query(`UPDATE ads_automation_rules SET thresholds = '{"minSpend":50}', updated_by = $2, change_reason = 'tune' WHERE id = $1`, [rule.id, ids.owner])
      await db.query(`UPDATE ads_automation_rules SET enabled = FALSE, updated_by = $2, change_reason = 'retire' WHERE id = $1`, [rule.id, ids.manager])
      const versions = (await db.query('SELECT version, change_type, actor_id, reason, before_state, after_state FROM ads_automation_rule_versions WHERE rule_id = $1 ORDER BY version', [rule.id])).rows
      expect(versions.map(v => [v.version, v.change_type, v.actor_id, v.reason])).toEqual([
        [1, 'created', ids.manager, 'create'],
        [2, 'updated', ids.owner, 'tune'],
        [3, 'disabled', ids.manager, 'retire']
      ])
      expect(versions[0].before_state).toBeNull()
      expect(versions[1].before_state.thresholds).toEqual({})
      expect(versions[1].after_state.thresholds).toEqual({ minSpend: 50 })

      await expectFailure('UPDATE ads_automation_rule_versions SET reason = $1', ['tamper'], /append-only/)
      await expectFailure('DELETE FROM ads_automation_rule_versions WHERE rule_id = $1', [rule.id], /append-only/)
      await expectFailure('DELETE FROM ads_automation_rules WHERE id = $1', [rule.id], /append-only/)
      await expectFailure('UPDATE ads_automation_rules SET client_id = client_id, created_by = $2, updated_by = $2 WHERE id = $1', [rule.id, ids.owner], /immutable/)
      await expectFailure(`INSERT INTO ads_automation_rules (client_id, family, risk_tier, mode, owner_user_id, expires_at, created_by, updated_by)
        VALUES ($1,'remove_campaign','high','auto_apply',$2,NOW() + INTERVAL '1 day',$2,$2)`, [ids.client, ids.owner], /check constraint/)

      const exec = (await db.query(`INSERT INTO ads_automation_executions (client_id, platform, account_id, family, risk_tier)
        VALUES ($1,'google_ads','123','negative_keywords','low') RETURNING id`, [ids.client])).rows[0]
      await db.query(`UPDATE ads_automation_executions SET status = 'succeeded', completed_at = NOW() WHERE id = $1`, [exec.id])
      await expectFailure(`UPDATE ads_automation_executions SET status = 'failed' WHERE id = $1`, [exec.id], /immutable once settled/)
      await expectFailure('DELETE FROM ads_automation_executions WHERE id = $1', [exec.id], /append-only/)
      await expectFailure(`INSERT INTO ads_automation_executions (client_id, platform, account_id, family, risk_tier)
        VALUES ($1,'google_ads','123','remove_campaign','high')`, [ids.client], /check constraint/)

      await db.query(`INSERT INTO ads_automation_control_events (actor_id, after_state) VALUES ($1, '{}')`, [ids.owner])
      await expectFailure('DELETE FROM ads_automation_control_events', [], /append-only/)
    } finally {
      await db.query('ROLLBACK')
      await db.end()
    }
  })
})
