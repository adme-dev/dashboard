/**
 * ADME Advertising — Xero Client Service
 *
 * Fetches clients from the Xero Contacts API (via existing OAuth integration)
 * and provides fuzzy matching for Monday.com → Xero contact name resolution.
 *
 * Unlike the static config files (COA, GST, tracking), this module works with
 * LIVE data from Xero or the local agency_clients table (synced from Xero).
 */

import type { H3Event } from 'h3'
import { createXeroClient } from '../xeroClient'
import { getActiveTokenForSession } from '../tokenStore'
import { getSelectedTenant } from '../session'
import { queryRows } from '../db'
import { dedupedXeroCall } from '../xeroRateLimit'

export interface XeroContact {
  name: string       // exact Xero contact name
  code: string       // Xero account number
  contactId: string  // Xero contact UUID
}

interface XeroContactsResponse {
  body?: {
    contacts?: Array<{
      name?: string
      accountNumber?: string
      contactID?: string
    }>
  }
}

// ── Dealer Groups (shared code prefix = same ownership group) ──────────────
// Business logic: which entities belong to which dealer group
export const DEALER_GROUPS: Record<string, string[]> = {
  'Alan Mance': ['AM1','AM2','AM3','AM4','AM5','AM6','AM7','AM9'],
  'Bay City / Frankston / Mornington': ['BCAG1','BCAG2','BCAG3','BCAG4','BCAG5','BCAG6','BCAG7','BCAG8','BCAG9','BCAG10','BCAG11','BCAG12','BCAG13'],
  'Brighton': ['BAG1','BAG3','BAG4','BAG6','BAG7','BAG8','BAH1','BAH2','BAH3','BAH4','BAH6','BAH7','BAH8','BAH9'],
  'Ballarat Motor Holdings': ['BMH2 Motus','BMH3 Motus','BMH4 Motus','BMH6 Motus','BMH7 Motus','BMH IU','BMJLR1 Motus'],
  'Berwick Motor Group': ['BerMG-Group','BerMGrp-GH','BerMGrp-J','BerMGrp-K','BerMGrp-N','BerMGrp-SS'],
  'Blood Auto Group': ['BLMGRP1','BLMGRP2','BLMGRP3','BLMGRP4','BLMGRP5','BLMGRP6'],
  'Eagers': ['EAGERS1','EAGERS2','EAGERS3','EAGERS4','EAGERS5','EAGERS6'],
  'Ferntree Gully': ['FTGD1','FTGD2','FTGD3','FTGD4','FTGD5','FTGD6','FTGD7','FTGD8','FTGD9'],
  'FNQ Motor Group': ['FNQM1','FNQM2','FNQM3','FNQM4','FNQM5'],
  'Garry & Warren Smith': ['GWSO1','GWSO2','GWSO3','GWSO4','GWSS1','GWSS2','GWSS3','GWSS4'],
  'Gippsland Motor Group': ['GMG3','GMG4','GMG5','GMG6 Motus','GMG7','GMG8'],
  'Kevin Dennis': ['KDM1','KDM2','KDM3'],
  'Northern Motor Group': ['NMG1','NMG3','NMG6','NMG9','NMG10','NMG11','NMG12','NMG14','NMG15','NMG16','NMG18'],
  'Peninsula / Mornington': ['PDG1','PDG2','PDG3'],
  'Sale Motors Group': ['SMG1','SMG2','SMG3','SMG4'],
  'Traralgon': ['GMG4','GMG8','TAGRP','TLMG2','TLMG4','VSL6'],
  'Valley Motor Group': ['VMG1','VMG4','VMG6','VMG7','VMG8','VMG9'],
  'Waverley': ['WMG3','WMG4','WMG5','WMG6','WMG7','WMG8','WMG9'],
}

// ── Payment Terms ───────────────────────────────────────────────────────────
// Standard: 7 days from invoice date
// Northern Group: 14 days from invoice date

export const FOURTEEN_DAY_CLIENTS = [
  'Northern Motor Group',
  'Northern Isuzu Ute',
  'Northern JAC Motors',
  'Northern Jeep',
  'Northern KIA',
  'Northern MG',
  'Northern Motor Group Service (415)',
  'Northern Nissan',
  'Northern RAM',
  'Northern KGM Ssangyong',
  'Northern Used Cars',
]

export function getPaymentTermDays(clientName: string): 7 | 14 {
  return FOURTEEN_DAY_CLIENTS.some(c => clientName.includes(c)) ? 14 : 7
}

// ── Fetch contacts from Xero API ────────────────────────────────────────────

/**
 * Fetches active customer contacts directly from the Xero API.
 * Requires an active Xero session (OAuth token + tenant).
 */
export async function fetchXeroContacts(event: H3Event): Promise<XeroContact[]> {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)

  if (!tenantId) {
    throw new Error('No Xero organization selected')
  }

  const client = await createXeroClient({ tokenSet: token, event })
  const contacts: XeroContact[] = []
  let page = 1
  const maxPages = 10

  while (page <= maxPages) {
    const response = await dedupedXeroCall<XeroContactsResponse>(
      `xero-clients:${tenantId}:p${page}`,
      'xero-clients',
      () => (client.accountingApi.getContacts as any)(
        tenantId,
        undefined,                          // ifModifiedSince
        'ContactStatus=="ACTIVE"&&IsCustomer==true',  // WHERE
        'Name ASC',                         // order
        undefined,                          // IDs
        page,                               // page (1-based)
        false                               // includeArchived
      )
    )

    const batch = response?.body?.contacts || []
    if (batch.length === 0) break

    for (const c of batch) {
      contacts.push({
        name: c.name || '',
        code: c.accountNumber || '',
        contactId: c.contactID || '',
      })
    }

    if (batch.length < 100) break
    page++
  }

  return contacts
}

// ── Fetch contacts from local DB (fallback) ─────────────────────────────────

/**
 * Fetches clients from the agency_clients table (synced from Xero).
 * Use when Xero session is not available.
 */
export async function fetchLocalClients(): Promise<XeroContact[]> {
  const rows = await queryRows<{
    name: string
    xero_contact_id: string | null
  }>(
    `SELECT name, xero_contact_id FROM agency_clients WHERE is_active = true ORDER BY name ASC`
  )

  return rows.map(r => ({
    name: r.name,
    code: '',  // agency_clients doesn't store account code
    contactId: r.xero_contact_id || '',
  }))
}

// ── Fuzzy matching ──────────────────────────────────────────────────────────
// Monday.com often uses shorthand client names that don't match Xero exactly.
// This finds the best match from the provided contacts list.

export interface MatchResult {
  contact: XeroContact
  exact: boolean
  score: number
}

export function matchClient(mondayName: string, contacts: XeroContact[]): MatchResult | null {
  const lower = mondayName.toLowerCase().trim()
  if (!lower) return null

  // Exact match first
  const exact = contacts.find(c => c.name.toLowerCase() === lower)
  if (exact) return { contact: exact, exact: true, score: 1.0 }

  // Contains match (Monday name is substring of Xero name or vice versa)
  const contains = contacts.find(c =>
    c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
  )
  if (contains) return { contact: contains, exact: false, score: 0.8 }

  // Word overlap scoring
  const mondayWords = lower.split(/[\s,&-]+/).filter(w => w.length > 2)
  let bestMatch: XeroContact | null = null
  let bestScore = 0

  for (const client of contacts) {
    const clientWords = client.name.toLowerCase().split(/[\s,&-]+/).filter(w => w.length > 2)
    const overlap = mondayWords.filter(w => clientWords.some(cw => cw.includes(w) || w.includes(cw)))
    const score = overlap.length / Math.max(mondayWords.length, 1)
    if (score > bestScore && score >= 0.5) {
      bestScore = score
      bestMatch = client
    }
  }

  if (bestMatch) return { contact: bestMatch, exact: false, score: bestScore }

  return null
}

// ── Lookup by account code ──────────────────────────────────────────────────
export function getClientByCode(code: string, contacts: XeroContact[]): XeroContact | undefined {
  return contacts.find(c => c.code === code)
}
