import { createError, readBody, setHeader } from 'h3'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrLaunchAttestationSchema } from '~~/server/utils/hr/launchReadiness'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const parsed = hrLaunchAttestationSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid launch attestation' })
  const input = parsed.data

  return transaction(async (db) => {
    const result = await db.query(
      `INSERT INTO hr_launch_gate_attestations
        (gate_key, status, evidence_reference, limitations, approved_by, approved_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $2 = 'approved' THEN NOW() ELSE NULL END, $6)
       RETURNING id, gate_key, status, evidence_reference, limitations, approved_by, approved_at, expires_at, created_at`,
      [input.gateKey, input.status, input.evidenceReference, input.limitations || null,
        user.id, input.expiresAt || null],
    )
    const row = result.rows[0]
    await recordHrAuditEvent({
      actorId: user.id,
      action: 'launch_gate.attested',
      targetType: 'hr_launch_gate_attestation',
      targetId: row.id,
      metadata: { gateKey: input.gateKey, status: input.status, expiresAt: input.expiresAt || null },
    }, db)
    return { attestation: row }
  })
})
