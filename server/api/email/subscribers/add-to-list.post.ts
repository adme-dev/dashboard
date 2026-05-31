// server/api/email/subscribers/add-to-list.post.ts
// Add existing records to a list: raw subscriber ids, or pull emails from
// the leads table (leads.field_data->>'email') / agency_clients contacts.

import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { upsertSubscriber, addToList, getList } from '~~/server/utils/email-marketing/db'
import { normalizeEmail, isValidEmail } from '~~/server/utils/email-marketing/email'

const Body = z.object({
  list_id: z.string().uuid(),
  subscriber_ids: z.array(z.string().uuid()).optional(),
  lead_ids: z.array(z.string().uuid()).optional(),
  client_ids: z.array(z.string().uuid()).optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const { list_id, subscriber_ids = [], lead_ids = [], client_ids = [] } = parsed.data

  const list = await getList(list_id)
  if (!list) throw createError({ statusCode: 404, statusMessage: 'list_not_found' })

  let added = 0

  // 1. Existing subscribers — straight membership add.
  for (const sid of subscriber_ids) {
    await addToList(sid, list_id, 'manual')
    added++
  }

  // 2. Leads — extract email + a display name from field_data.
  if (lead_ids.length) {
    const leads = await queryRows<{ id: string, client_id: string | null, field_data: Record<string, string> }>(
      'SELECT id, client_id, field_data FROM leads WHERE id = ANY($1::uuid[])',
      [lead_ids]
    )
    for (const lead of leads) {
      const fd = lead.field_data || {}
      const email = fd.email || fd.email_address
      if (!email || !isValidEmail(email)) continue
      const name = fd.full_name || fd.name
        || [fd.first_name, fd.last_name].filter(Boolean).join(' ') || null
      const id = await upsertSubscriber({
        email: normalizeEmail(email),
        name,
        attribs: {},
        client_id: lead.client_id,
        created_by: user.id
      })
      await addToList(id, list_id, 'leads')
      added++
    }
  }

  // 3. Clients — pull cached primary contact email from xero_contacts_cache.
  if (client_ids.length) {
    const contacts = await queryRows<{ client_id: string, name: string | null, email: string | null }>(
      `SELECT ac.id AS client_id, ac.name, x.email AS email
       FROM agency_clients ac
       LEFT JOIN xero_contacts_cache x ON x.contact_id = ac.xero_contact_id
       WHERE ac.id = ANY($1::uuid[])`,
      [client_ids]
    )
    for (const c of contacts) {
      if (!c.email || !isValidEmail(c.email)) continue
      const id = await upsertSubscriber({
        email: normalizeEmail(c.email),
        name: c.name,
        attribs: {},
        client_id: c.client_id,
        created_by: user.id
      })
      await addToList(id, list_id, 'clients')
      added++
    }
  }

  return { added }
})
