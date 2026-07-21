import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/268_send_foundation.sql', import.meta.url),
  'utf8'
)

const runbook = readFileSync(
  new URL('../../docs/runbooks/send-foundation-migration-268.md', import.meta.url),
  'utf8'
)

const requiredTables = [
  'send_public_senders',
  'send_transfers',
  'send_files',
  'send_recipients',
  'send_upload_intents',
  'send_events'
]

describe('Send foundation migration 268', () => {
  it('creates the complete canonical transfer schema idempotently', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')

    for (const table of requiredTables) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
  })

  it('models workspace and verified-public ownership as mutually exclusive', () => {
    expect(migration).toContain(`sender_class IN ('workspace', 'public')`)
    expect(migration).toMatch(/sender_class = 'workspace'[\s\S]*owner_team_member_id IS NOT NULL[\s\S]*public_sender_id IS NULL/)
    expect(migration).toMatch(/sender_class = 'public'[\s\S]*owner_team_member_id IS NULL[\s\S]*public_sender_id IS NOT NULL/)
    expect(migration).toContain('REFERENCES agency_clients(id)')
    expect(migration).toContain('REFERENCES team_members(id)')
    expect(migration).toContain('REFERENCES send_public_senders(id)')
    expect(migration).toContain('REFERENCES projects(client_id, id)')
    expect(migration).toContain('CHECK (project_id IS NULL OR client_id IS NOT NULL)')
  })

  it('captures transfer and file lifecycle states from the approved PRD', () => {
    for (const state of [
      'draft',
      'awaiting_verification',
      'uploading',
      'scanning',
      'ready',
      'revoked',
      'expired',
      'deletion_pending',
      'deleted',
      'failed'
    ]) {
      expect(migration).toContain(`'${state}'`)
    }

    for (const state of ['pending', 'uploading', 'uploaded', 'quarantined', 'clean', 'aborted', 'rejected', 'failed', 'deleted']) {
      expect(migration).toContain(`'${state}'`)
    }
  })

  it('stores only hashes for access, management, password, and verification secrets', () => {
    expect(migration).toContain('share_token_hash TEXT UNIQUE')
    expect(migration).toContain('management_token_hash TEXT UNIQUE')
    expect(migration).toContain('password_hash TEXT')
    expect(migration).toContain('verification_token_hash TEXT UNIQUE')
    expect(migration).toContain(`CHECK (share_token_hash IS NULL OR share_token_hash ~ '^[a-f0-9]{64}$')`)
    expect(migration).toContain(`CHECK (status <> 'ready' OR share_token_hash IS NOT NULL)`)
    expect(migration).toContain('OLD.share_token_hash IS NOT NULL')
    expect(migration).toContain('OLD.status = \'scanning\'')
    expect(migration).toContain('NEW.status = \'ready\'')
    expect(migration).toContain(`LEFT(password_hash, 4) IN ('$2a$', '$2b$', '$2y$')`)
    expect(migration).not.toMatch(/^\s*(share_token|management_token|password|verification_token)\s+/im)
    expect(migration).not.toMatch(/^\s*(signed_url|public_url|presigned_url)\s+/im)
  })

  it('enforces totals, expiry, generated object keys, and idempotency invariants', () => {
    expect(migration).toContain('CHECK (expires_at > created_at)')
    expect(migration).toContain('CHECK (expected_total_bytes <= configured_max_bytes)')
    expect(migration).toContain('CHECK (actual_total_bytes <= configured_max_bytes)')
    expect(migration).toContain('CHECK (expected_file_count <= configured_max_files)')
    expect(migration).toContain('CHECK (actual_file_count <= configured_max_files)')
    expect(migration).toContain('object_key TEXT NOT NULL UNIQUE')
    expect(migration).toContain(`object_key LIKE ('send/' || transfer_id::TEXT || '/%')`)
    expect(migration).toMatch(/FOREIGN KEY \([\s\S]*object_key,[\s\S]*expected_size_bytes,[\s\S]*expected_mime_type,[\s\S]*upload_method[\s\S]*REFERENCES send_files/)
    expect(migration).toContain('UNIQUE (transfer_id, idempotency_key)')
    expect(migration).toContain("'upload_aborted'")
    expect(migration).toContain('UNIQUE (file_id, idempotency_key)')
    expect(migration).toContain('UNIQUE (transfer_id, uploader_class, uploader_id, idempotency_key)')
    expect(migration).toContain('CHECK (completed_at IS NULL OR completed_at <= expires_at)')
  })

  it('keeps events append-only, idempotent, and hostile to obvious secret metadata', () => {
    expect(migration).toContain('prevent_send_event_mutation')
    expect(migration).toContain('trg_send_events_append_only')
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON send_events')
    expect(migration).toContain('UNIQUE (transfer_id, idempotency_key)')
    expect(migration).toContain(`metadata ?| ARRAY['password', 'shareToken', 'managementToken', 'signedUrl', 'ipAddress']`)
    expect(migration).toContain('protect_send_transfer_identity_and_policy')
    expect(migration).toContain('Published Send policy snapshots are immutable')
  })

  it('adds access, lifecycle, cleanup, and reconciliation indexes', () => {
    for (const index of [
      'idx_send_transfers_workspace_owner',
      'idx_send_transfers_client',
      'idx_send_transfers_public_sender',
      'idx_send_transfers_expiry_cleanup',
      'idx_send_files_transfer_state',
      'idx_send_upload_intents_expiry',
      'idx_send_events_transfer_time'
    ]) {
      expect(migration).toContain(index)
    }
  })

  it('documents forward-fix and approval-safe rollback procedures', () => {
    expect(runbook).toContain('Forward-fix is the default')
    expect(runbook).toContain('Before activation')
    expect(runbook).toContain('After activation')
    expect(runbook).toContain('Do not apply this migration to a shared database without explicit approval')
    expect(runbook).toContain('Do not drop `send_events`')
  })
})
