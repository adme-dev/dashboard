// server/api/crm/people/import.post.ts
// Accepts { client_id, csv } and bulk-creates people. Maps common headers; idempotent on email.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { parseCsv, normalizeKey } from '~~/server/utils/crm/csv'

const Body = z.object({ client_id: z.string().uuid(), csv: z.string().min(1) })

type PersonCol = 'first_name' | 'last_name' | 'email' | 'phone' | 'mobile' | 'job_title' | 'department' | 'city'

const HEADER_MAP: Record<string, PersonCol> = {
  first_name: 'first_name', firstname: 'first_name', first: 'first_name',
  last_name: 'last_name', lastname: 'last_name', last: 'last_name', surname: 'last_name',
  email: 'email', email_address: 'email',
  phone: 'phone', phone_number: 'phone', mobile: 'mobile',
  job_title: 'job_title', title: 'job_title', department: 'department', city: 'city',
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const { client_id, csv } = parsed.data

  const rows = parseCsv(csv)
  if (rows.length < 2) throw createError({ statusCode: 400, statusMessage: 'CSV has no data rows' })
  const headers = rows[0].map(normalizeKey)
  const result = { imported: 0, skipped: 0, errors: [] as { row: number, message: string }[] }

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r]
    if (cols.every(c => !c.trim())) continue
    const rec: Partial<Record<PersonCol, string>> = {}
    headers.forEach((h, i) => {
      const target = HEADER_MAP[h]
      if (target && cols[i]?.trim()) rec[target] = cols[i].trim()
    })
    if (!rec.first_name) { result.errors.push({ row: r + 1, message: 'missing first_name' }); continue }
    try {
      if (rec.email) {
        const dup = await queryRows(
          `SELECT 1 FROM crm_people WHERE client_id = $1 AND lower(email) = lower($2) AND deleted_at IS NULL LIMIT 1`,
          [client_id, rec.email],
        )
        if (dup.length) { result.skipped++; continue }
      }
      await queryOne(
        `INSERT INTO crm_people (client_id, first_name, last_name, email, phone, mobile, job_title, department, city, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [client_id, rec.first_name, rec.last_name ?? null, rec.email ?? null, rec.phone ?? null,
          rec.mobile ?? null, rec.job_title ?? null, rec.department ?? null, rec.city ?? null, user.id],
      )
      result.imported++
    } catch (e: any) {
      result.errors.push({ row: r + 1, message: e?.message ?? 'insert_failed' })
    }
  }
  return result
})
