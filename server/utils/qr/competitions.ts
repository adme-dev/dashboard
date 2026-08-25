import type { H3Event } from 'h3'
import { createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { ANALYTICS_ROLES, accessibleClientIds, isUuid } from '~~/server/utils/client-access'
import { CompetitionDetailsSchema, PermitRowSchema, type CompetitionDetails, type PermitRow } from '~~/shared/qr/competition'

export interface CompetitionRow {
  id: string
  client_id: string
  name: string
  type: 'chance' | 'skill'
  status: 'draft' | 'open' | 'closed' | 'drawn' | 'archived'
  timezone: string
  opens_at: string | null
  closes_at: string | null
  details: CompetitionDetails
  permits: PermitRow[]
  terms_current_version: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export function parseCompetitionRow(row: any): CompetitionRow {
  const details = CompetitionDetailsSchema.safeParse(row.details ?? {})
  const permits = Array.isArray(row.permits) ? row.permits.map((p: unknown) => PermitRowSchema.safeParse(p)).filter((r: any) => r.success).map((r: any) => r.data) : []
  return { ...row, details: details.success ? details.data : CompetitionDetailsSchema.parse({}), permits }
}

/** Staff access to a competition: same client scoping as the QR tool. */
export async function requireCompetitionAccess(event: H3Event, id: string | undefined) {
  const user = await requireAuth(event)
  await requireRole(event, ANALYTICS_ROLES)
  if (!isUuid(id)) throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
  const row = await queryOne<any>(`SELECT * FROM qr_competitions WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
  const scope = await accessibleClientIds(user)
  if (scope && !scope.includes(row.client_id)) throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
  return { user, row: parseCompetitionRow(row) }
}

/** True while entries may be accepted. */
export function competitionIsOpen(c: Pick<CompetitionRow, 'status' | 'opens_at' | 'closes_at'>, now = new Date()): { open: boolean, reason: string } {
  if (c.status !== 'open') return { open: false, reason: c.status === 'draft' ? 'This competition has not opened yet' : 'This competition has closed' }
  if (c.opens_at && new Date(c.opens_at) > now) return { open: false, reason: 'This competition has not opened yet' }
  if (c.closes_at && new Date(c.closes_at) <= now) return { open: false, reason: 'Entries have closed' }
  return { open: true, reason: '' }
}

/** Stable per-person key for entry limits: normalised mobile if present, else lowercased email. */
export function entrantKey(fields: Record<string, string>): string | null {
  const phone = (fields.phone ?? fields.mobile ?? '').replace(/\D/g, '')
  if (phone.length >= 8) return `tel:${phone.replace(/^0/, '61')}`
  const email = (fields.email ?? '').trim().toLowerCase()
  if (email) return `email:${email}`
  return null
}
