/**
 * Bulk Auto-Match Clients to Xero Contacts
 * Matches unlinked agency clients to Xero contacts by exact name (case-insensitive)
 */

import { queryRows, execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { createXeroClient } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)

  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })
  }

  try {
    // Fetch unlinked clients
    const unlinkedClients = await queryRows(
      `SELECT id, name FROM agency_clients WHERE xero_contact_id IS NULL`,
      []
    )

    if (unlinkedClients.length === 0) {
      return { matched: 0, unmatched: [] }
    }

    // Fetch Xero contacts
    const client = await createXeroClient({ tokenSet: token, event })
    const response = await (client.accountingApi.getContacts as any)(
      tenantId,
      undefined,
      'ContactStatus=="ACTIVE"',
      'Name ASC',
      undefined,
      1,
      false
    )

    const xeroContacts: Array<{ contactID: string; name: string }> = response?.body?.contacts || []

    // Build lookup map: lowercase name → contactID
    const xeroNameMap = new Map<string, string>()
    for (const contact of xeroContacts) {
      xeroNameMap.set(contact.name.toLowerCase(), contact.contactID)
    }

    // Match and update
    let matched = 0
    const unmatched: string[] = []

    for (const agencyClient of unlinkedClients) {
      const xeroContactId = xeroNameMap.get(agencyClient.name.toLowerCase())
      if (xeroContactId) {
        await execute(
          `UPDATE agency_clients SET xero_contact_id = $1, updated_at = NOW() WHERE id = $2`,
          [xeroContactId, agencyClient.id]
        )
        matched++
      } else {
        unmatched.push(agencyClient.name)
      }
    }

    return { matched, unmatched }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Xero bulk match error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to match clients with Xero contacts'
    })
  }
})
