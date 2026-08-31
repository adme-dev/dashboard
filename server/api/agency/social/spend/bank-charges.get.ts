import { requireAuth } from '~~/server/utils/auth'
import { xeroFetch } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows } from '~~/server/utils/db'
import { getAccountMonthlySpend } from '~~/server/utils/metaClient'
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

interface XeroBankAccount {
  accountID?: string
  name?: string
  type?: string
  bankAccountType?: string
}

interface XeroBankTransaction {
  bankTransactionID?: string
  date?: string
  total?: number
  reference?: string
  description?: string
  contact?: { name?: string }
  type?: string
}

interface NormalizedBankTransaction {
  bankTransactionID: string
  date: string
  total: number
  reference?: string
  description?: string
  contact?: { name?: string }
  type?: string
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

  // Total wall-clock budget for the entire handler. CF Pages drops the
  // connection (504) somewhere past ~30s; we cap at 24s so the response can
  // still serialize and travel back. Every async leg below checks remaining
  // time and bails to "partial" if the budget is exhausted.
  const HANDLER_BUDGET_MS = 24_000
  const handlerStart = Date.now()
  const remaining = () => HANDLER_BUDGET_MS - (Date.now() - handlerStart)

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
    tenantId = await getSelectedTenant(event) ?? null
  } catch {
    // Xero not connected — graceful degradation
    return { period, byPlatform: {}, total: 0, unmatchedTotal: 0, unmatched: [], connected: false }
  }

  if (!token?.access_token || !tenantId) {
    return { period, byPlatform: {}, total: 0, unmatchedTotal: 0, unmatched: [], connected: false }
  }
  const scopedTenantId = tenantId
  const accessToken = token.access_token

  // Bank Charged is an expensive, rate-limit-prone live Xero crawl (it's what
  // trips the 'concurrent' 429s). Cache the computed result per tenant+period in
  // KV so repeated page loads don't re-hammer Xero. Only complete results are
  // cached — never a truncated 'partial' one. `?refresh=1` bypasses the read
  // (used by the post-sync refresh) but still repopulates the cache.
  const cache = (event.context as any).cloudflare?.env?.CACHE as
    | { get(k: string): Promise<string | null>; put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void> }
    | undefined
  const cacheKey = `spend:bankcharges:${tenantId}:${period}`
  const BANK_CHARGES_TTL_SECONDS = 3 * 60 * 60
  const refreshParam = String(query.refresh ?? '')
  const skipCacheRead = refreshParam === '1' || refreshParam === 'true'

  if (cache && !skipCacheRead) {
    try {
      const cached = await cache.get(cacheKey)
      if (cached) return JSON.parse(cached)
    } catch { /* cache miss / parse error → compute fresh below */ }
  }

  // Date range for the month
  const startDate = new Date(Date.UTC(year, month - 1, 1))
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = new Date(Date.UTC(year, month - 1, lastDay))

  // Xero classifies both bank and credit-card accounts as Type=BANK;
  // BankAccountType distinguishes BANK, CREDITCARD and PAYPAL. Use the direct
  // fetch helper because xero-node's axios transport can stall on CF Pages.
  let accountListFailed = false
  const accountParams = new URLSearchParams({
    where: 'Type=="BANK"',
    order: 'Name ASC',
  })
  const bankResponse = await dedupedXeroCall(
    `bank-charges-bank:${tenantId}`,
    'bank-charges-bank',
    () => xeroFetch<{ accounts?: XeroBankAccount[] }>({
      accessToken,
      tenantId,
      path: `Accounts?${accountParams.toString()}`,
      timeoutMs: Math.max(1_000, Math.min(12_000, remaining() - 3_000)),
    }),
  ).catch(err => {
    accountListFailed = true
    console.warn('[BankCharges] bank account list failed:', err)
    return null
  })
  const bankAccounts = bankResponse?.accounts || []

  // Fetch transactions per account, parallelized with the remaining wall-time
  // budget. Each Xero fetch has its own 12s deadline; we layer the
  // handler budget on top so even slow per-account calls can't push the
  // handler past CF Pages' 30s cap.
  // Xero caps in-flight requests at 5 per tenant (429 with
  // x-rate-limit-problem: "concurrent" once exceeded). Stay at 4 so the
  // spend dashboard's other parallel Xero-backed endpoints have a slot of
  // headroom; dedupedXeroCall's 429 backoff absorbs any residual collision.
  const CONCURRENCY = 4
  let budgetExhausted = remaining() <= 1_000  // already over → mark partial, skip transaction loop
  let transactionFetchFailed = false

  const allTransactions: NormalizedBankTransaction[] = []

  const accountQueue = [...bankAccounts]

  async function fetchAccount() {
    while (accountQueue.length && !budgetExhausted) {
      // Reserve ~3s for response serialization and the meta-billing fallback.
      if (remaining() <= 3_000) {
        budgetExhausted = true
        return
      }
      const account = accountQueue.shift()
      if (!account?.accountID) {
        transactionFetchFailed = true
        continue
      }
      try {
        const transactionParams = new URLSearchParams({
          where: `BankAccount.AccountID==Guid("${account.accountID}")&&Date>=${dtExpr(startDate)}&&Date<=${dtExpr(endDate)}`,
          order: 'Date ASC',
          page: '1',
          pageSize: '500',
        })
        const txBody = await dedupedXeroCall(
          `bank-charges-tx:${scopedTenantId}:${account.accountID}`,
          'bank-charges-tx',
          () => xeroFetch<{ bankTransactions?: XeroBankTransaction[] }>({
            accessToken,
            tenantId: scopedTenantId,
            path: `BankTransactions?${transactionParams.toString()}`,
            timeoutMs: Math.max(1_000, Math.min(12_000, remaining() - 3_000)),
          }),
        )

        const txns = txBody?.bankTransactions || []
        // Only include SPEND/outflow transactions (negative amounts or type=SPEND)
        for (const tx of txns) {
          const amount = Number(tx.total) || 0
          // Bank transactions: negative = outflow, or type == 'SPEND'
          if (amount < 0 || tx.type === 'SPEND') {
            allTransactions.push({
              bankTransactionID: tx.bankTransactionID || '',
              date: ensureDateString(new Date(tx.date || '')),
              total: Math.abs(amount),
              reference: tx.reference,
              description: tx.description,
              contact: tx.contact,
              type: tx.type,
            })
          }
        }
      } catch (err) {
        transactionFetchFailed = true
        console.warn(`[BankCharges] Failed to fetch transactions for ${account.name}:`, err)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, bankAccounts.length) }, () => fetchAccount())
  )

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
  // Need at least ~5s of headroom: one DB query + parallel Meta Insights calls
  // for every connected account. Skip otherwise so the response can serialize
  // before CF Pages cuts the function.
  let metaBilling: { total: number; accounts: Array<{ accountId: string; accountName: string; total: number }> } | null = null
  const metaXeroTotal = byPlatform['meta']?.total ?? 0
  if (metaXeroTotal <= 0 && !budgetExhausted && remaining() > 5_000) {
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

  const result = {
    period,
    byPlatform,
    total,
    unmatchedTotal,
    unmatched: unmatched.slice(0, 20),
    metaBilling,
    connected: true,
    partial: budgetExhausted || accountListFailed || transactionFetchFailed,
    accountsScanned: bankAccounts.length - accountQueue.length,
    accountsTotal: bankAccounts.length,
  }

  // Cache only complete results — a partial (truncated) total would otherwise be
  // served stale for hours.
  if (cache && !result.partial) {
    try {
      await cache.put(cacheKey, JSON.stringify(result), { expirationTtl: BANK_CHARGES_TTL_SECONDS })
    } catch { /* non-fatal — just means the next load recomputes */ }
  }

  return result
})
