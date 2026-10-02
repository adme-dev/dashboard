import type { SocialAccount, SocialPublishPlatform } from '~/types'

const TRANSIENT_CONNECT_QUERY_KEYS = new Set([
  'social_connected',
  'social_error',
  'social_select'
])

export function socialPublishingConnectionRecovery(error: unknown) {
  if (error === 'expired_state') {
    return {
      title: 'Facebook connection expired',
      description: 'Start a fresh connection for the selected client. Your existing account assignments are kept.',
      retryMeta: true
    }
  }
  if (error === 'invalid_state') {
    return {
      title: 'Connection could not be completed',
      description: 'The connection session is no longer valid. Choose the correct client and reconnect the account.',
      retryMeta: false
    }
  }
  return null
}

function normaliseSearch(value: string): string {
  return value.trim().toLowerCase()
}

export function filterSocialPublishingAccounts(
  accounts: SocialAccount[],
  search: string
): SocialAccount[] {
  const query = normaliseSearch(search)
  if (!query) return accounts

  return accounts.filter((account) => {
    const fields = [
      account.account_name,
      account.platform_account_id,
      account.platform,
      account.last_error,
      account.connection_health,
      account.connection_health_label,
      account.connection_health_reason,
      account.linked_facebook_account_name
    ]

    return fields.some(field => String(field ?? '').toLowerCase().includes(query))
  })
}

export function socialPublishingAccountsForPlatform(
  accounts: SocialAccount[],
  platform: SocialPublishPlatform
): SocialAccount[] {
  return accounts.filter(account => account.platform === platform)
}

export function stripSocialPublishingConnectQuery(
  query: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(([key]) => !TRANSIENT_CONNECT_QUERY_KEYS.has(key))
  )
}
