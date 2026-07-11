import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { hrRosterClassificationSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const memberIdResult = z.string().uuid().safeParse(getRouterParam(event, 'memberId'))
  if (!memberIdResult.success) throw createError({ statusCode: 400, statusMessage: 'A valid team member ID is required' })
  const parsed = hrRosterClassificationSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid roster classification', data: { issues: parsed.error.issues } })

  const classification = await transaction(async (db) => {
    const memberResult = await db.query('SELECT id, name FROM team_members WHERE id = $1 AND is_active = TRUE FOR UPDATE', [memberIdResult.data])
    const member = memberResult.rows[0]
    if (!member) throw createError({ statusCode: 404, statusMessage: 'Active team member not found' })
    const previousResult = await db.query('SELECT classification, person_type, review_eligible FROM hr_roster_classifications WHERE team_member_id = $1', [member.id])
    const saved = await db.query(
      `INSERT INTO hr_roster_classifications
        (team_member_id, classification, person_type, review_eligible, reason, confirmed_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (team_member_id) DO UPDATE SET
         classification = EXCLUDED.classification,
         person_type = EXCLUDED.person_type,
         review_eligible = EXCLUDED.review_eligible,
         reason = EXCLUDED.reason,
         confirmed_by = EXCLUDED.confirmed_by,
         confirmed_at = NOW(), updated_at = NOW()
       RETURNING *`,
      [member.id, parsed.data.classification, parsed.data.personType || null, parsed.data.reviewEligible, parsed.data.reason, user.id],
    )
    await recordHrAuditEvent({
      actorId: user.id,
      action: 'roster.classification_updated',
      targetType: 'team_member',
      targetId: member.id,
      metadata: {
        previousClassification: previousResult.rows[0]?.classification || null,
        classification: parsed.data.classification,
        reviewEligible: parsed.data.reviewEligible,
      },
    }, db)
    return { ...saved.rows[0], member_name: member.name }
  })

  return { classification }
})
