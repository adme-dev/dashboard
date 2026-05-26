import { execute } from '~~/server/utils/db'

let ensurePromise: Promise<void> | null = null

export interface OfficeAuditEventInput {
  officeId: string
  actorId?: string | null
  action: string
  targetType: string
  targetId?: string | null
  metadata?: Record<string, unknown>
}

export function ensureOfficeAuditEventsTable() {
  ensurePromise ??= ensureOfficeAuditEventsTableOnce().catch((error) => {
    ensurePromise = null
    throw error
  })

  return ensurePromise
}

async function ensureOfficeAuditEventsTableOnce() {
  await execute(`
    CREATE TABLE IF NOT EXISTS office_audit_events (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      office_id   uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
      actor_id    uuid REFERENCES team_members(id) ON DELETE SET NULL,
      action      text NOT NULL,
      target_type text NOT NULL,
      target_id   uuid,
      metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `)
  await execute(`
    ALTER TABLE office_audit_events
      ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS target_id uuid,
      ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_audit_events_office
      ON office_audit_events(office_id, created_at DESC)
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_audit_events_target
      ON office_audit_events(target_type, target_id, created_at DESC)
      WHERE target_id IS NOT NULL
  `)
}

export async function logOfficeAuditEvent(input: OfficeAuditEventInput) {
  await ensureOfficeAuditEventsTable()
  await execute(
    `INSERT INTO office_audit_events (
       office_id, actor_id, action, target_type, target_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.officeId,
      input.actorId ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  )
}
