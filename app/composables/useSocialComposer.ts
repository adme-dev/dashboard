import type { SocialAccount, SocialPublishPlatform, SocialPlatformOverride, SocialPost } from '~/types'

export type ScheduleMode = 'now' | 'schedule' | 'queue'

export interface ComposerState {
  id: string | null
  content: string
  mediaUrls: string[]
  linkUrl: string
  hashtags: string[]
  firstComment: string
  tags: string[]
  platforms: SocialPublishPlatform[]
  accountIds: string[]
  customizePerNetwork: boolean
  platformOverrides: Record<string, SocialPlatformOverride>
  scheduleMode: ScheduleMode
  scheduledAt: string | null
  timezone: string
  creativeId: string | null
}

export function emptyComposerState(): ComposerState {
  return {
    id: null,
    content: '',
    mediaUrls: [],
    linkUrl: '',
    hashtags: [],
    firstComment: '',
    tags: [],
    platforms: [],
    accountIds: [],
    customizePerNetwork: false,
    platformOverrides: {},
    scheduleMode: 'schedule',
    scheduledAt: null,
    timezone: 'Australia/Sydney',
    creativeId: null
  }
}

/** Pure: resolve the effective content for one platform (base + override). Mirrors the server. */
export function resolveComposerContent(
  state: Pick<ComposerState, 'content' | 'mediaUrls' | 'customizePerNetwork' | 'platformOverrides'>,
  platform: string
): { content: string, mediaUrls: string[] } {
  const ov = state.customizePerNetwork ? state.platformOverrides[platform] : undefined
  return {
    content: ov?.content ?? state.content,
    mediaUrls: ov?.mediaUrls ?? state.mediaUrls
  }
}

/** Pure: serialize composer state to the posts API body. */
export function composerToBody(state: ComposerState, clientId: string): Record<string, unknown> {
  return {
    clientId,
    content: state.content,
    mediaUrls: state.mediaUrls.length ? state.mediaUrls : null,
    linkUrl: state.linkUrl || null,
    hashtags: state.hashtags.length ? state.hashtags : null,
    firstComment: state.firstComment || null,
    platforms: state.platforms,
    accountIds: state.accountIds.length ? state.accountIds : null,
    platformOverrides: state.customizePerNetwork ? state.platformOverrides : {},
    tags: state.tags.length ? state.tags : null,
    scheduledAt: state.scheduleMode === 'now' ? null : state.scheduledAt,
    timezone: state.timezone,
    metadata: state.creativeId ? { creativeId: state.creativeId } : {}
  }
}

type ComposerAccount = Pick<SocialAccount, 'id' | 'platform' | 'is_active' | 'last_error' | 'requires_reconnect' | 'connection_health'>

function isSelectablePublishingAccount(account: ComposerAccount): boolean {
  if (!account.is_active) return false
  if (account.requires_reconnect || account.connection_health === 'reconnect' || account.connection_health === 'disconnected') return false
  if (!account.connection_health && account.last_error) return false
  return true
}

function activeAccountById(accounts: ComposerAccount[]) {
  return new Map(accounts
    .filter(isSelectablePublishingAccount)
    .map(account => [account.id, account]))
}

export function syncComposerAccountIds(
  platforms: SocialPublishPlatform[],
  accountIds: string[],
  accounts: ComposerAccount[]
): string[] {
  const selectedPlatforms = new Set(platforms)
  const byId = activeAccountById(accounts)
  const next = accountIds.filter((id) => {
    const account = byId.get(id)
    return account && selectedPlatforms.has(account.platform)
  })

  for (const platform of platforms) {
    const hasSelectedAccount = next.some(id => byId.get(id)?.platform === platform)
    if (hasSelectedAccount) continue

    const platformAccounts = accounts.filter(account =>
      account.platform === platform && isSelectablePublishingAccount(account))
    if (platformAccounts.length === 1) next.push(platformAccounts[0]!.id)
  }

  return next
}

export function missingAccountPlatforms(
  platforms: SocialPublishPlatform[],
  accountIds: string[],
  accounts: ComposerAccount[]
): SocialPublishPlatform[] {
  const byId = activeAccountById(accounts)
  return platforms.filter(platform =>
    !accountIds.some(id => byId.get(id)?.platform === platform))
}

export function useSocialComposer() {
  const state = useState<ComposerState>('social-composer', emptyComposerState)

  function reset() {
    state.value = emptyComposerState()
  }

  function loadFromPost(post: SocialPost) {
    const creativeId = post.metadata?.creativeId
    state.value = {
      id: post.id,
      content: post.content ?? '',
      mediaUrls: post.media_urls ?? [],
      linkUrl: post.link_url ?? '',
      hashtags: post.hashtags ?? [],
      firstComment: post.first_comment ?? '',
      tags: post.tags ?? [],
      platforms: post.platforms ?? [],
      accountIds: post.account_ids ?? [],
      customizePerNetwork: Object.keys(post.platform_overrides ?? {}).length > 0,
      platformOverrides: post.platform_overrides ?? {},
      scheduleMode: post.scheduled_at ? 'schedule' : 'now',
      scheduledAt: post.scheduled_at,
      timezone: post.timezone ?? 'Australia/Sydney',
      creativeId: typeof creativeId === 'string' ? creativeId : null
    }
  }

  function setOverride(platform: string, patch: SocialPlatformOverride) {
    state.value.platformOverrides = {
      ...state.value.platformOverrides,
      [platform]: { ...state.value.platformOverrides[platform], ...patch }
    }
  }

  const resolved = (platform: string) => resolveComposerContent(state.value, platform)
  const toBody = (clientId: string) => composerToBody(state.value, clientId)

  return { state, reset, loadFromPost, setOverride, resolved, toBody }
}
