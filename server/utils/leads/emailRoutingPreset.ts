import { createError } from 'h3'
import { transaction } from '~~/server/utils/db'

type DbClient = Parameters<typeof transaction>[0] extends (client: infer Client) => Promise<unknown> ? Client : never

export type EmailRoutingPreset = 'portal' | 'portal_notification' | 'assign_user'

export interface ApplyEmailRoutingPresetInput {
  clientId: string
  formId: string
  formName: string
  preset: EmailRoutingPreset | null
  notificationEmail?: string
  assignedUserId?: string
}

async function assertActorCanManageClient(db: DbClient, clientId: string, actorId: string) {
  const access = await db.query<{ allowed: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM team_members tm
      WHERE tm.id = $1 AND tm.is_active = TRUE
        AND (
          tm.user_role IN ('owner', 'admin', 'lead', 'project_manager')
          OR EXISTS (
            SELECT 1 FROM client_team_assignments cta
            WHERE cta.client_id = $2 AND cta.team_member_id = tm.id
          )
        )
    ) AS allowed
  `, [actorId, clientId])
  if (!access.rows[0]?.allowed) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
}

async function requireAssignedUserInClient(db: DbClient, clientId: string, userId: string) {
  const member = await db.query<{ id: string }>(`
    SELECT tm.id
    FROM team_members tm
    JOIN client_team_assignments cta ON cta.team_member_id = tm.id
    WHERE tm.id = $1 AND cta.client_id = $2 AND tm.is_active = TRUE
    LIMIT 1
  `, [userId, clientId])
  if (!member.rows[0]) throw createError({ statusCode: 400, statusMessage: 'assigned_user_not_in_client' })
}

function destinationsFor(input: ApplyEmailRoutingPresetInput) {
  if (input.preset === 'portal') return [{ type: 'portal', config: {} }]
  if (input.preset === 'portal_notification') {
    if (!input.notificationEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.notificationEmail)) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_notification_email' })
    }
    return [
      { type: 'portal', config: {} },
      { type: 'email', config: {
        to: [input.notificationEmail],
        subject_template: 'New lead',
        body_template: '{{full_name}}'
      } }
    ]
  }
  if (input.preset === 'assign_user') {
    if (!input.assignedUserId) throw createError({ statusCode: 400, statusMessage: 'assigned_user_required' })
    return [{ type: 'assign_user', config: { user_id: input.assignedUserId } }]
  }
  return []
}

export async function applyEmailRoutingPreset(
  input: ApplyEmailRoutingPresetInput,
  actorId: string,
  client?: DbClient,
): Promise<{ ruleId: string | null, destinationIds: string[] }> {
  if (!input.preset) return { ruleId: null, destinationIds: [] }
  const run = async (db: DbClient) => {
    await assertActorCanManageClient(db, input.clientId, actorId)
    if (input.preset === 'assign_user') await requireAssignedUserInClient(db, input.clientId, input.assignedUserId!)
    const rule = await db.query<{ id: string }>(`
      INSERT INTO lead_form_rules (client_id, source, form_id, form_name, created_by)
      VALUES ($1, 'email', $2, $3, $4)
      ON CONFLICT (source, form_id) DO UPDATE
        SET form_name = COALESCE(lead_form_rules.form_name, EXCLUDED.form_name), updated_at = NOW()
      WHERE lead_form_rules.client_id = EXCLUDED.client_id
      RETURNING id
    `, [input.clientId, input.formId, input.formName, actorId])
    const ruleId = rule.rows[0]?.id
    if (!ruleId) throw createError({ statusCode: 409, statusMessage: 'form_rule_client_conflict' })

    const destinationIds: string[] = []
    for (const destination of destinationsFor(input)) {
      // A preset may add its own destination, but must never rewrite filters or delays
      // an operator has configured on an existing destination.
      const existing = await db.query<{ id: string }>(`
        SELECT id FROM lead_rule_destinations
        WHERE rule_id = $1 AND destination_type = $2 AND config = $3::jsonb
        ORDER BY created_at ASC LIMIT 1
      `, [ruleId, destination.type, JSON.stringify(destination.config)])
      if (existing.rows[0]) {
        destinationIds.push(existing.rows[0].id)
        continue
      }
      const inserted = await db.query<{ id: string }>(`
        INSERT INTO lead_rule_destinations
          (rule_id, destination_type, config, filter, delay_minutes, enabled, sort_order)
        VALUES ($1, $2, $3::jsonb, NULL, 0, TRUE, 0)
        RETURNING id
      `, [ruleId, destination.type, JSON.stringify(destination.config)])
      destinationIds.push(inserted.rows[0]!.id)
    }
    return { ruleId, destinationIds }
  }
  return client ? run(client) : transaction(run)
}
