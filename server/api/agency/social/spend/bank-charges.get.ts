import { requireAuth } from '~~/server/utils/auth'
import { createXeroClient } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows } from '~~/server/utils/db'
import { getAccountMonthlySpend } from '~~/server/utils/metaClient'
import { cachedFetch } from '~~/server/utils/kv'
import { dedupedXeroCall } from '~~/server/utils/xeroRateLimit'

/**
 * GET /api/agency/social/spend/bank-charges
 *
 * Two data sources for actual charges:
 * 1. Xero bank + credit card transactions — pattern-matched to platforms
 * 2. Meta Billing API — direct billing charges from Facebook
 *
 * Returns both so the UI can show bank charges and highlight
 * overlap or discrepancies between sources.
 */

// Pattern rules — order matters (first match wins)
const PLATFORM_PATTERNS: Array<{ platform: string; patterns: RegExp[] }> = [
  {
    platform: 'meta',
    patterns: [
      /\bFACEBK\b/i,
      /\bFACEBOOK\b/i,
      /\bMETA\s*PLATFORMS?\b/i,
      /\bMETA\s*ADS\b/i,
      /\bFB\s+ADS\b/i,
      /\bINSTAGRAM\s*ADS?\b/i,
    ],
  },
  {
    platform: 'google_ads',
    patterns: [
      /\bGOOGLE\s*\*?\s*ADS\b/i,
      /\bGOOGLE\s*ADVERTISING\b/i,
      /\bADWORDS\b/i,
      /\bYOUTUBE\s*ADS?\b/i,
      /\bGADS\b/i,
    ],
  },
  {
    platform: 'tiktok',
    patterns: [/\bTIKTOK\b/i, /\bBYTEDANCE\b/i, /\bTIK\s*TOK\b/i],
  },
  {
    platform: 'linkedin',
    patterns: [/\bLINKEDIN\b/i],
  },
  {
    platform: 'pinterest',
    patterns: [/\bPINTEREST\b/i],
  },
  {
    platform: 'snapchat',
    patterns: [/\bSNAPCHAT\b/i, /\bSNAP\s*INC\b/i],
  },
  {
    platform: 'twitter',
    patterns: [/\bTWITTER\b/i, /\bX\s+CORP\b/i, /\bX\.COM\b/i],
  },
  {
    platform: 'microsoft_ads',
    patterns: [
      /\bMICROSOFT\s*ADS?\b/i,
      /\bBING\s*ADS?\b/i,
    ],
  },
]

interface BankChargeTransaction {
  date: string
  amount: number
  description: string
  bankTransactionId: string
  contact?: string
}

function identifyPlatform(description: string, contactName?: string): string | null {
  const searchText = `${description} ${contactName || ''}`
  for (const rule of PLATFORM_PATTERNS) {
    for (const pattern of rule.patterns) {
      if (pattern.test(searchText)) return rule.platform
    }
  }
  return null
}

function dtExpr(d: Date) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `DateTime(${y},${m},${day})`
}

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default eventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const now = new Date()
  const month = parseInt(String(query.month || now.getMonth() + 1), 10)
  const year = parseInt(String(query.year || now.getFullYear()), 10)
  const period = `${year}-${String(month).padStart(2, '0')}`

  // Try to get Xero session — if not connected, return empty
  let token
  let tenantId: string | null = null
  try {
    token = await getActiveTokenForSession(event)
    tenantId = await getSelectedTenant(event)
  } catch {
    // Xero not connected — graceful degradation
    return { period, byPlatform: {}, total: 0, unmatchedTotal: 0, unmatched: [], connected: false }
  }

  if (!token || !tenantId) {
    return { period, byPlatform: {}, total: 0, unmatchedTotal: 0, unmatched: [], connected: false }
  }

  const client = await createXeroClient({ tokenSet: token, event })

  // Date range for the month
  const startDate = new Date(Date.UTC(year, month - 1, 1))
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = new Date(Date.UTC(year, month - 1, lastDay))

  // Get all bank AND credit card accounts (Meta charges often hit a CC, not the bank)
  const bankResponse = await dedupedXeroCall(
    `bank-charges-bank:${tenantId}`,
    'bank-charges-bank',
    async () => {
      const { body } = await client.accountingApi.getAccounts(tenantId, undefined, 'Type=="BANK"', 'Name ASC')
      return body
    }
  )
  const ccResponse = await dedupedXeroCall(
    `bank-charges-cc:${tenantId}`,
    'bank-charges-cc',
    async () => {
      const { body } = await client.accountingApi.getAccounts(tenantId, undefined, 'Type=="CREDITCARD"', 'Name ASC')
      return body
    }
  )
  const bankAccounts = [
    ...(bankResponse?.accounts || []),
    ...(ccResponse?.accounts || []),
  ]

  // Fetch transactions for each bank account in the date range
  const allTransactions: Array<{
    bankTransactionID: string
    date: string
    total: number
    reference?: string
    description?: string
    contact?: { name?: string }
    type?: string
  }> = []

  for (const account of bankAccounts) {
    try {
      const txBody = await dedupedXeroCall(
        `bank-charges-tx:${tenantId}:${account.accountID}`,
        'bank-charges-tx',
        async () => {
          const { body } = await client.accountingApi.getBankTransactions(
            tenantId,
            undefined,
            `BankAccount.AccountID==Guid("${account.accountID}")&&Date>=${dtExpr(startDate)}&&Date<=${dtExpr(endDate)}`,
            'Date ASC',
            1,
            undefined,
            500
          )
          return body
        }
      )

      const txns = txBody?.bankTransactions || []
      // Only include SPEND/outflow transactions (negative amounts or type=SPEND)
      for (const tx of txns) {
        const amount = Number(tx.total) || 0
        // Bank transactions: negative = outflow, or type == 'SPEND'
        if (amount < 0 || (tx as any).type === 'SPEND') {
          allTransactions.push({
            bankTransactionID: tx.bankTransactionID || '',
            date: ensureDateString(new Date(tx.date || '')),
            total: Math.abs(amount),
            reference: tx.reference,
            description: (tx as any).description,
            contact: tx.contact,
            type: (tx as any).type,
          })
        }
      }
    } catch (err) {
      console.warn(`[BankCharges] Failed to fetch transactions for ${account.name}:`, err)
    }
  }

  // Group transactions by platform
  const byPlatform: Record<string, { total: number; transactions: BankChargeTransaction[] }> = {}
  const unmatched: BankChargeTransaction[] = []
  let total = 0
  let unmatchedTotal = 0

  for (const tx of allTransactions) {
    const desc = tx.reference || tx.description || ''
    const contactName = tx.contact?.name || ''
    const platform = identifyPlatform(desc, contactName)

    const item: BankChargeTransaction = {
      date: tx.date,
      amount: tx.total,
      description: desc || contactName || 'Bank Transaction',
      bankTransactionId: tx.bankTransactionID,
      contact: contactName || undefined,
    }

    if (platform) {
      if (!byPlatform[platform]) {
        byPlatform[platform] = { total: 0, transactions: [] }
      }
      byPlatform[platform].total = Math.round((byPlatform[platform].total + tx.total) * 100) / 100
      byPlatform[platform].transactions.push(item)
      total = Math.round((total + tx.total) * 100) / 100
    } else {
      unmatched.push(item)
      unmatchedTotal = Math.round((unmatchedTotal + tx.total) * 100) / 100
    }
  }

  // --- Meta spend from Facebook Insights API (fallback when Xero has no Meta CC data) ---
  let metaBilling: { total: number; accounts: Array<{ accountId: string; accountName: string; total: number }> } | null = null
  const metaXeroTotal = byPlatform['meta']?.total ?? 0
  if (metaXeroTotal <= 0) {
    try {
      const connections = await queryRows<{
        id: string
        account_id: string
        account_name: string
        access_token: string
        metadata: any
      }>(
        `SELECT id, account_id, account_name, access_token, metadata
         FROM social_connections
         WHERE platform = 'meta' AND status = 'active'`
      )

      if (connections.length > 0) {
        let metaTotal = 0
        const metaAccounts: Array<{ accountId: string; accountName: string; total: number }> = []

        await Promise.all(connections.map(async (conn) => {
          const actId = conn.metadata?.actId || `act_${conn.account_id}`
          const summary = await getAccountMonthlySpend(actId, conn.access_token, month, year)
          if (summary.spend > 0) {
            metaTotal += summary.spend
            metaAccounts.push({
              accountId: conn.account_id,
              accountName: conn.account_name,
              total: Math.round(summary.spend * 100) / 100,
            })
          }
        }))

        if (metaTotal > 0) {
          metaBilling = {
            total: Math.round(metaTotal * 100) / 100,
            accounts: metaAccounts,
          }
        }
      }
    } catch (err) {
      console.warn('[BankCharges] Meta billing fetch failed:', err)
    }
  }

  return {
    period,
    byPlatform,
    total,
    unmatchedTotal,
    unmatched: unmatched.slice(0, 20),
    metaBilling,
    connected: true,
  }
})
