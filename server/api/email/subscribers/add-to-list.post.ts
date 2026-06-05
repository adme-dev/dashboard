// server/api/email/subscribers/add-to-list.post.ts
// Add existing records to a list: raw subscriber ids, or pull emails from
// the leads table (leads.field_data->>'email') / agency_clients contacts.

import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { upsertSubscriber, addToList, getList } from '~~/server/utils/email-marketing/db'
import { assertEmailClientAccess, isAgencyEmailUser } from '~~/server/utils/email-marketing/access'
import { normalizeSubscriberEmail, isValidEmail } from '~~/server/utils/email-marketing/email'

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
  await assertEmailClientAccess(event, user, list.client_id)
  const agencyUser = isAgencyEmailUser(user)

  let subscriberRows: Array<{ id: string, client_id: string | null }> = []
  let leads: Array<{ id: string, client_id: string | null, field_data: Record<string, string> }> = []
  let contacts: Array<{ client_id: string, name: string | null, email: string | null }> = []

  if (subscriber_ids.length) {
    subscriberRows = await queryRows<{ id: string, client_id: string | null }>(
      'SELECT id, client_id FROM email_subscribers WHERE id = ANY($1::uuid[])',
      [subscriber_ids]
    )
    if (subscriberRows.length !== Array.from(new Set(subscriber_ids)).length) {
      throw createError({ statusCode: 404, statusMessage: 'subscriber_not_found' })
    }
    if (!agencyUser && subscriberRows.some(row => row.client_id !== list.client_id)) {
      throw createError({ statusCode: 403, statusMessage: 'email_list_client_mismatch' })
    }
  }

  if (lead_ids.length) {
    leads = await queryRows<{ id: string, client_id: string | null, field_data: Record<string, string> }>(
      'SELECT id, client_id, field_data FROM leads WHERE id = ANY($1::uuid[])',
      [lead_ids]
    )
    for (const lead of leads) {
      if (!agencyUser && lead.client_id !== list.client_id) {
        throw createError({ statusCode: 403, statusMessage: 'email_list_client_mismatch' })
      }
    }
  }

  if (client_ids.length) {
    contacts = await queryRows<{ client_id: string, name: string | null, email: string | null }>(
      `SELECT ac.id AS client_id, ac.name, x.email AS email
       FROM agency_clients ac
       LEFT JOIN xero_contacts_cache x ON x.contact_id = ac.xero_contact_id
       WHERE ac.id = ANY($1::uuid[])`,
      [client_ids]
    )
    for (const c of contacts) {
      if (!agencyUser && c.client_id !== list.client_id) {
        throw createError({ statusCode: 403, statusMessage: 'email_list_client_mismatch' })
      }
    }
  }

  let added = 0

  // 1. Existing subscribers — straight membership add.
  for (const sid of subscriberRows.map(row => row.id)) {
    await addToList(sid, list_id, 'manual')
    added++
  }

  // 2. Leads — extract email + a display name from field_data.
  for (const lead of leads) {
    const fd = lead.field_data || {}
    const email = fd.email || fd.email_address
    if (!email || !isValidEmail(email)) continue
    const name = fd.full_name || fd.name
      || [fd.first_name, fd.last_name].filter(Boolean).join(' ') || null
    const id = await upsertSubscriber({
      email: normalizeSubscriberEmail(email),
      name,
      attribs: {},
      client_id: lead.client_id,
      created_by: user.id
    })
    await addToList(id, list_id, 'leads')
    added++
  }

  // 3. Clients — pull cached primary contact email from xero_contacts_cache.
  for (const c of contacts) {
    if (!c.email || !isValidEmail(c.email)) continue
    const id = await upsertSubscriber({
      email: normalizeSubscriberEmail(c.email),
      name: c.name,
      attribs: {},
      client_id: c.client_id,
      created_by: user.id
    })
    await addToList(id, list_id, 'clients')
    added++
  }

  return { added }
})
