import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'

const schema = z.object({
  decisions: z.array(z.object({
    contactId: z.string().min(1),
    tenantId: z.string().min(1),
    xeroName: z.string().min(1),
    target: z.discriminatedUnion('type', [
      z.object({ type: z.literal('existing'), clientId: z.string().uuid() }),
      z.object({ type: z.literal('new'), clientName: z.string().min(1) })
    ])
  })).min(1)
})

/**
 * POST /api/agency/clients/reconcile/apply
 * Creates/links group clients from approved decisions. Idempotent:
 * client_xero_contacts has UNIQUE(tenant_id, xero_contact_id); new clients are
 * only created when no active client of that name exists. admin/owner only.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const body = schema.parse(await readBody(event))

  let created = 0, linked = 0, skipped = 0

  await transaction(async (client) => {
    const nameToId = new Map<string, string>() // group name (lower) → client_id, this run

    for (const d of body.decisions) {
      let clientId: string

      if (d.target.type === 'existing') {
        clientId = d.target.clientId
      } else {
        const key = d.target.clientName.toLowerCase().trim()
        if (nameToId.has(key)) {
          clientId = nameToId.get(key)!
        } else {
          const existing = await client.query(
            `SELECT id FROM agency_clients WHERE lower(name) = lower($1) AND is_active = true LIMIT 1`,
            [d.target.clientName]
          )
          if (existing.rows[0]) {
            clientId = existing.rows[0].id
          } else {
            const ins = await client.query(
              `INSERT INTO agency_clients (name, is_active) VALUES ($1, true) RETURNING id`,
              [d.target.clientName]
            )
            clientId = ins.rows[0].id
            created++
          }
          nameToId.set(key, clientId)
        }
      }

      const link = await client.query(
        `INSERT INTO client_xero_contacts (client_id, tenant_id, xero_contact_id, xero_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, xero_contact_id) DO NOTHING
         RETURNING id`,
        [clientId, d.tenantId, d.contactId, d.xeroName]
      )
      if (link.rows[0]) linked++
      else skipped++
    }
  })

  return { ok: true, created, linked, skipped }
})
