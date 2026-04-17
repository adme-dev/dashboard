/**
 * Xero Contacts Sync Endpoint
 * Syncs contacts from Xero to the local agency_clients table
 */

import { createError } from 'h3'
import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'
import { transaction } from '../../../utils/db'
import { dedupedXeroCall } from '~~/server/utils/xeroRateLimit'

export default defineEventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)

  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })
  }

  const body = await readBody(event).catch(() => ({}))
  const syncSuppliers = body.syncSuppliers === true // Only sync customers by default
  const pageSize = 100
  let page = 1
  let hasMore = true
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[]
  }

  const client = await createXeroClient({ tokenSet: token, event })

  try {
    while (hasMore) {
      // Fetch contacts from Xero
      const response = await dedupedXeroCall(
        `sync-contacts:${tenantId}:p${page}`,
        'sync-contacts',
        () => (client.accountingApi.getContacts as any)(
          tenantId,
          undefined,
          'ContactStatus=="ACTIVE"',
          'Name ASC',
          undefined,
          page,
          false
        )
      )

      const contacts = response?.body?.contacts || []
      
      if (contacts.length === 0) {
        hasMore = false
        break
      }

      // Process each contact
      for (const contact of contacts) {
        // Skip suppliers if not syncing them
        if (!syncSuppliers && !contact.isCustomer) {
          results.skipped++
          continue
        }

        try {
          await transaction(async (trx) => {
            // Check if client already exists by Xero contact ID
            const existing = await trx.query(
              'SELECT id FROM agency_clients WHERE xero_contact_id = $1',
              [contact.contactID]
            )

            // Extract payment terms
            const paymentTerms = contact.paymentTerms?.sales?.day || 30

            // Determine billing type based on data
            let billingType = 'project'
            if (contact.balances?.accountsReceivable?.outstanding > 0) {
              // Has outstanding AR - likely a regular customer
              billingType = 'project'
            }

            if (existing.rows.length > 0) {
              // Update existing
              await trx.query(
                `UPDATE agency_clients SET
                  name = $1,
                  billing_type = $2,
                  payment_terms = $3,
                  updated_at = NOW()
                WHERE xero_contact_id = $4`,
                [
                  contact.name,
                  billingType,
                  paymentTerms,
                  contact.contactID
                ]
              )
              results.updated++
            } else {
              // Create new
              await trx.query(
                `INSERT INTO agency_clients
                  (name, xero_contact_id, billing_type, payment_terms, is_active)
                VALUES ($1, $2, $3, $4, true)`,
                [
                  contact.name,
                  contact.contactID,
                  billingType,
                  paymentTerms
                ]
              )
              results.created++
            }
          })
        } catch (err: any) {
          console.error(`Failed to sync contact ${contact.name}:`, err)
          results.errors.push(`${contact.name}: ${err.message}`)
        }
      }

      // Check if there are more pages
      hasMore = contacts.length === pageSize
      page++

      // Safety limit - don't sync more than 1000 contacts
      if (page > 10) {
        hasMore = false
      }
    }

    return {
      success: true,
      message: `Sync complete. Created: ${results.created}, Updated: ${results.updated}, Skipped: ${results.skipped}`,
      ...results
    }
  } catch (error: any) {
    console.error('Xero contacts sync error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error?.response?.data?.message || error?.message || 'Failed to sync contacts from Xero'
    })
  }
})
