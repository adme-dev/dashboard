/**
 * Xero Contacts API Endpoint
 * Fetches contacts (customers) directly from Xero — all pages
 */

import { createError } from 'h3'
import { createXeroClient } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '~~/server/utils/kv'

export interface XeroContact {
  contactID: string
  contactNumber?: string
  accountNumber?: string
  contactStatus: 'ACTIVE' | 'ARCHIVED'
  name: string
  firstName?: string
  lastName?: string
  emailAddress?: string
  skypeUserName?: string
  contactPersons?: Array<{
    firstName: string
    lastName: string
    emailAddress?: string
    includeInEmails: boolean
  }>
  bankAccountDetails?: string
  taxNumber?: string
  accountsReceivableTaxType?: string
  accountsPayableTaxType?: string
  addresses?: Array<{
    addressType: 'STREET' | 'POBOX'
    addressLine1?: string
    addressLine2?: string
    addressLine3?: string
    addressLine4?: string
    city?: string
    region?: string
    postalCode?: string
    country?: string
    attentionTo?: string
  }>
  phones?: Array<{
    phoneType: 'DEFAULT' | 'DDI' | 'MOBILE' | 'FAX'
    phoneNumber?: string
    phoneAreaCode?: string
    phoneCountryCode?: string
  }>
  isSupplier: boolean
  isCustomer: boolean
  defaultCurrency?: string
  updatedDateUTC?: string
  contactGroups?: Array<{ contactGroupID: string; name: string }>
  website?: string
  purchaseDefaultAccountCode?: string
  salesDefaultAccountCode?: string
  brandingTheme?: { brandingThemeID: string; name: string }
  batchPayments?: {
    bankAccountNumber?: string
    bankAccountName?: string
    details?: string
  }
  discount?: number
  balances?: {
    accountsReceivable?: {
      outstanding: number
      overdue: number
    }
    accountsPayable?: {
      outstanding: number
      overdue: number
    }
  }
  paymentTerms?: {
    sales?: {
      day: number
      type: 'OFFOLLOWINGMONTH' | 'DAYSAFTERBILLDATE' | 'DAYSAFTERBILLMONTH'
    }
    bills?: {
      day: number
      type: 'OFFOLLOWINGMONTH' | 'DAYSAFTERBILLDATE' | 'DAYSAFTERBILLMONTH'
    }
  }
}

export default defineEventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)

  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })
  }

  const client = await createXeroClient({ tokenSet: token, event })

  try {
    return await cachedFetch(event, `xero:contacts:${tenantId}`, 300, async () => {
      // Fetch all pages of active contacts from Xero (100 per page)
      const allContacts: XeroContact[] = []
      let page = 1
      const MAX_PAGES = 10 // Safety cap: 1000 contacts max

      while (page <= MAX_PAGES) {
        const response = await (client.accountingApi.getContacts as any)(
          tenantId,
          undefined, // ifModifiedSince
          'ContactStatus=="ACTIVE"', // where - only active contacts
          'Name ASC', // order
          undefined, // iDs
          page, // page
          false // includeArchived
        )

        const pageContacts: XeroContact[] = response?.body?.contacts || []
        allContacts.push(...pageContacts)

        // Xero returns up to 100 per page — if fewer, we've reached the last page
        if (pageContacts.length < 100) break
        page++
      }

      const contacts = allContacts

      // Transform to a cleaner format
      const formattedContacts = contacts.map((contact: XeroContact) => {
        const primaryAddress = contact.addresses?.find((a: any) => a.addressType === 'STREET') || contact.addresses?.[0]
        const primaryPhone = contact.phones?.find((p: any) => p.phoneType === 'DEFAULT') || contact.phones?.[0]
        const primaryPerson = contact.contactPersons?.find((p: any) => p.includeInEmails) || contact.contactPersons?.[0]

        return {
          id: contact.contactID,
          contactNumber: contact.contactNumber,
          accountNumber: contact.accountNumber,
          name: contact.name,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.emailAddress || primaryPerson?.emailAddress,
          phone: primaryPhone ? `${primaryPhone.phoneCountryCode || ''} ${primaryPhone.phoneAreaCode || ''} ${primaryPhone.phoneNumber || ''}`.trim() : undefined,
          isCustomer: contact.isCustomer,
          isSupplier: contact.isSupplier,
          status: contact.contactStatus,
          defaultCurrency: contact.defaultCurrency,
          website: contact.website,
          taxNumber: contact.taxNumber,
          address: primaryAddress ? {
            line1: primaryAddress.addressLine1,
            line2: primaryAddress.addressLine2,
            city: primaryAddress.city,
            region: primaryAddress.region,
            postalCode: primaryAddress.postalCode,
            country: primaryAddress.country
          } : undefined,
          balances: contact.balances ? {
            receivableOutstanding: contact.balances.accountsReceivable?.outstanding,
            receivableOverdue: contact.balances.accountsReceivable?.overdue,
            payableOutstanding: contact.balances.accountsPayable?.outstanding,
            payableOverdue: contact.balances.accountsPayable?.overdue
          } : undefined,
          paymentTerms: contact.paymentTerms?.sales ? {
            days: contact.paymentTerms.sales.day,
            type: contact.paymentTerms.sales.type
          } : undefined,
          updatedAt: contact.updatedDateUTC
        }
      })

      return {
        contacts: formattedContacts,
        count: formattedContacts.length,
        customerCount: formattedContacts.filter((c: any) => c.isCustomer).length,
        supplierCount: formattedContacts.filter((c: any) => c.isSupplier).length
      }
    })
  } catch (error: any) {
    console.error('Xero contacts fetch error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error?.response?.data?.message || error?.message || 'Failed to fetch contacts from Xero'
    })
  }
})
