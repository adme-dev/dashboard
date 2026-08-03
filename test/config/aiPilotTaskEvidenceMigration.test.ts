import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('server/database/migrations/341_ai_pilot_task_evidence.sql', 'utf8')

describe('AI pilot task evidence migration', () => {
  it('creates a durable exact-identity state machine with replay and relationship constraints', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ai_pilot_task_evidence')
    for (const column of [
      'request_id UUID NOT NULL UNIQUE', 'turn_id UUID NOT NULL UNIQUE',
      'pack_release_id UUID NOT NULL REFERENCES ai_pack_releases(id)',
      'pack_version_id UUID NOT NULL REFERENCES ai_capability_pack_versions(id)',
      'eval_suite_version_id UUID NOT NULL REFERENCES ai_eval_suite_versions(id)',
      'eval_case_id UUID NOT NULL REFERENCES ai_eval_cases(id)',
      'pilot_episode_audit_id UUID NOT NULL REFERENCES ai_catalog_audit_events(id)',
      'conversation_id UUID NOT NULL REFERENCES ai_conversations(id)',
      'actor_user_id UUID NOT NULL REFERENCES team_members(id)',
      'issuer_user_id UUID NOT NULL REFERENCES team_members(id)',
      'assistant_message_id UUID REFERENCES ai_messages(id)',
      'assessor_user_id UUID REFERENCES team_members(id)'
    ]) expect(migration).toContain(column)
    expect(migration).toMatch(/UNIQUE \(pack_release_id, pilot_episode_audit_id, eval_case_id, actor_user_id, turn_id\)/)
    expect(migration).toContain('CHECK (assessor_user_id IS NULL OR (assessor_user_id <> issuer_user_id AND assessor_user_id <> actor_user_id))')
  })

  it('enforces monotonic timestamps, immutable identity, and append-only terminal assessment', () => {
    expect(migration).toContain('issued_at <= started_at')
    expect(migration).toContain('started_at <= terminal_at')
    expect(migration).toContain('terminal_at <= assessed_at')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION enforce_ai_pilot_task_evidence_transition()')
    expect(migration).toContain("OLD.state = 'assessed'")
    expect(migration).toContain('pilot evidence identity is immutable')
    expect(migration).toContain("run.status = 'completed' AND run.gate_passed = TRUE")
    expect(migration).toContain('latest_audit.id = NEW.pilot_episode_audit_id')
    expect(migration).toContain('CREATE TRIGGER trg_ai_pilot_task_evidence_transition')
  })
})
