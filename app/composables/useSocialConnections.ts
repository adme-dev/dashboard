import type { SocialConnection, MetaSpendRecord, CampaignDailySpendResponse, SocialPlatform } from '~/types'

interface SpendSummaryItem {
  platform: string
  clientName: string
  clientCode: string | null
  budget: number
  spend: number
  commission: number
  variance: number
  variancePercent: number
  impressions: number
  clicks: number
  conversions: number
  campaignCount: number
}

interface SpendSummary {
  month: number
  year: number
  platform: string
  items: SpendSummaryItem[]
  totals: { budget: number; spend: number; commission: number; variance: number }
}

export function useSocialConnections() {
  const connections = ref<any[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchConnections() {
    loading.value = true
    error.value = null
    try {
      connections.value = await $fetch('/api/agency/social/connections')
    } catch (e: any) {
      error.value = e.data?.statusMessage || e.message
    } finally {
      loading.value = false
    }
  }

  interface OAuthResult {
    success: boolean
    platform: string
    accounts: number
    error: string | null
  }

  const lastOAuthResult = ref<OAuthResult | null>(null)

  async function connectPlatform(platform: SocialPlatform): Promise<OAuthResult> {
    const { url } = await $fetch<{ url: string }>(`/api/agency/social/${platform}/connect`)
    // Open OAuth popup
    const popup = window.open(url, `${platform}_connect`, 'width=600,height=700,scrollbars=yes')

    return new Promise<OAuthResult>((resolve) => {
      let resolved = false

      // Listen for postMessage from popup
      function onMessage(e: MessageEvent) {
        if (e.origin !== window.location.origin) return
        if (e.data?.type !== 'oauth_result') return
        cleanup()
        const result: OAuthResult = {
          success: e.data.success,
          platform: e.data.platform,
          accounts: e.data.accounts || 0,
          error: e.data.error || null,
        }
        lastOAuthResult.value = result
        fetchConnections()
        resolve(result)
      }

      window.addEventListener('message', onMessage)

      // Fallback: poll for popup close (in case postMessage fails)
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          cleanup()
          if (!resolved) {
            const fallbackResult: OAuthResult = { success: false, platform, accounts: 0, error: 'Popup closed before completing' }
            // Re-fetch connections — if any were created, override the result
            fetchConnections().then(() => {
              const newConns = connections.value.filter(c => c.platform === platform && c.status === 'active')
              if (newConns.length > 0) {
                const successResult: OAuthResult = { success: true, platform, accounts: newConns.length, error: null }
                lastOAuthResult.value = successResult
                resolve(successResult)
              } else {
                lastOAuthResult.value = fallbackResult
                resolve(fallbackResult)
              }
            })
          }
        }
      }, 500)

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        cleanup()
        const result: OAuthResult = { success: false, platform, accounts: 0, error: 'Connection timed out' }
        lastOAuthResult.value = result
        resolve(result)
      }, 300000)

      function cleanup() {
        if (resolved) return
        resolved = true
        window.removeEventListener('message', onMessage)
        clearInterval(timer)
        clearTimeout(timeout)
      }
    })
  }

  function clearOAuthResult() {
    lastOAuthResult.value = null
  }

  async function connectWithToken(platform: SocialPlatform, accessToken: string): Promise<OAuthResult> {
    try {
      const result = await $fetch<{ success: boolean; accounts: number; message: string }>(
        `/api/agency/social/${platform}/connect-token`,
        { method: 'POST', body: { accessToken } }
      )
      const oauthResult: OAuthResult = {
        success: result.success,
        platform,
        accounts: result.accounts,
        error: null,
      }
      lastOAuthResult.value = oauthResult
      await fetchConnections()
      return oauthResult
    } catch (e: any) {
      const msg = e.data?.statusMessage || e.message || 'Token validation failed'
      const oauthResult: OAuthResult = { success: false, platform, accounts: 0, error: msg }
      lastOAuthResult.value = oauthResult
      return oauthResult
    }
  }

  async function disconnectConnection(connectionId: string) {
    await $fetch(`/api/agency/social/connections/${connectionId}`, { method: 'DELETE' })
    await fetchConnections()
  }

  /**
   * Kicks off a platform spend sync. The endpoint now runs fire-and-forget
   * via Cloudflare's waitUntil — it returns { status: 'started', startedAt }
   * almost immediately. Callers should poll connections.lastSyncedAt or
   * refresh loadSpend after a delay to see the resulting data.
   */
  async function syncSpend(platform: SocialPlatform, month?: number, year?: number) {
    const body: any = {}
    if (month) body.month = month
    if (year) body.year = year
    return await $fetch<{ status: 'started'; startedAt: string; jobId?: string }>(
      `/api/agency/social/${platform}/sync-spend`,
      { method: 'POST', body, timeout: 30_000 }
    )
  }

  async function fetchSpendSummary(month: number, year: number, platform?: string): Promise<SpendSummary> {
    const params: any = { month, year }
    if (platform && platform !== 'all') params.platform = platform
    return await $fetch('/api/agency/social/spend/summary', { params })
  }

  async function updateClientMappings(connectionId: string, mappings: any[]) {
    return await $fetch(`/api/agency/social/connections/${connectionId}/client-map`, {
      method: 'PUT',
      body: { mappings },
    })
  }

  async function fetchPlatformAccounts(platform: string) {
    return await $fetch<any[]>(`/api/agency/social/${platform}/accounts`)
  }

  async function disconnectPlatform(platform: string) {
    const platformConns = connections.value.filter(c => c.platform === platform)
    for (const conn of platformConns) {
      await $fetch(`/api/agency/social/connections/${conn.id}`, { method: 'DELETE' })
    }
    await fetchConnections()
  }

  async function fetchAccountSpend(platform: SocialPlatform, month: number, year: number) {
    return await $fetch<any[]>(`/api/agency/social/${platform}/account-spend`, {
      params: { month, year },
    })
  }

  async function fetchAccountCampaigns(platform: SocialPlatform, connectionId: string, month: number, year: number) {
    return await $fetch<any[]>(`/api/agency/social/${platform}/account-campaigns`, {
      params: { connectionId, month, year },
    })
  }

  async function updateCampaignBudget(spendId: string, budgetAllocated: number, rolling?: boolean) {
    return await $fetch<{ updated: boolean; id: string; budgetAllocated: number; rolling: boolean }>(
      `/api/agency/social/spend/${spendId}`,
      { method: 'PATCH', body: { budgetAllocated, rolling: rolling ?? false } }
    )
  }

  async function fetchDailySpend(platform: SocialPlatform, month: number, year: number) {
    return await $fetch<{ date: string; spend: number; budget: number; impressions: number; clicks: number }[]>(
      `/api/agency/social/daily-spend`,
      { params: { platform, month, year } }
    )
  }

  async function fetchCampaignDailySpend(platform: SocialPlatform, month: number, year: number, connectionId?: string) {
    const params: Record<string, any> = { platform, month, year }
    if (connectionId) params.connectionId = connectionId
    return await $fetch<CampaignDailySpendResponse>(
      `/api/agency/social/campaign-daily-spend`,
      { params }
    )
  }

  interface BudgetAuditEntry {
    id: string
    previousBudget: number
    newBudget: number
    changedBy: string
    changedByName: string
    changedByAvatar: string | null
    changedAt: string
    note: string | null
  }

  async function fetchBudgetHistory(spendId: string) {
    return await $fetch<BudgetAuditEntry[]>(`/api/agency/social/spend/${spendId}/history`)
  }

  async function importCsvSpend(file: File, platform: string, period: string) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('platform', platform)
    formData.append('period', period)
    return await $fetch<{ imported: number; skipped: number; errors: string[] }>(
      '/api/agency/social/import/csv',
      { method: 'POST', body: formData }
    )
  }

  async function importManualSpend(data: {
    platform: string
    campaignName: string
    date: string
    spend: number
    impressions?: number
    clicks?: number
    conversions?: number
    clientId?: string
    period: string
  }) {
    return await $fetch<{ success: boolean; id: string }>(
      '/api/agency/social/import/manual',
      { method: 'POST', body: data }
    )
  }

  return {
    connections,
    loading,
    error,
    lastOAuthResult,
    fetchConnections,
    connectPlatform,
    connectWithToken,
    clearOAuthResult,
    disconnectConnection,
    disconnectPlatform,
    syncSpend,
    fetchSpendSummary,
    updateClientMappings,
    fetchPlatformAccounts,
    fetchAccountSpend,
    fetchAccountCampaigns,
    updateCampaignBudget,
    fetchDailySpend,
    fetchCampaignDailySpend,
    fetchBudgetHistory,
    importCsvSpend,
    importManualSpend,
  }
}
