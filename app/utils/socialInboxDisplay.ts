export interface SocialInboxIdentityInput {
  platform: string | null | undefined
  channelType?: string | null
  name: string | null | undefined
}

export interface SocialInboxAccountContextInput {
  accountName?: string | null
  platformAccountId?: string | null
  clientName?: string | null
}

export interface SocialInboxIdentityDisplay {
  label: string
  unavailable: boolean
  reason: string | null
}

const META_PLATFORMS = new Set(['facebook', 'instagram'])

export function getSocialInboxIdentityDisplay(input: SocialInboxIdentityInput): SocialInboxIdentityDisplay {
  const name = input.name?.trim()
  if (name) {
    return { label: name, unavailable: false, reason: null }
  }

  const platform = input.platform?.trim().toLowerCase() || ''
  if (META_PLATFORMS.has(platform)) {
    return {
      label: 'Name unavailable',
      unavailable: true,
      reason: platform === 'facebook'
        ? 'Meta did not return this profile name. Some identities are withheld for privacy, and Page user-content access requires an approved permission.'
        : 'Meta did not return this profile name. Some identities are withheld for privacy.'
    }
  }

  if (platform === 'google-business') {
    return {
      label: 'Unidentified Google reviewer',
      unavailable: true,
      reason: 'Google Business Profile did not provide a reviewer display name for this review.'
    }
  }

  return {
    label: 'Unidentified user',
    unavailable: true,
    reason: 'The platform did not provide a display name for this interaction.'
  }
}

export function getSocialInboxAccountContextDisplay(input: SocialInboxAccountContextInput): string | null {
  const accountName = input.accountName?.trim()
  const platformAccountId = input.platformAccountId?.trim()
  const account = accountName || platformAccountId || null
  const clientName = input.clientName?.trim()
  if (!clientName) return account
  if (!account || account.localeCompare(clientName, undefined, { sensitivity: 'accent' }) === 0) {
    return account || clientName
  }
  return `${account} · ${clientName}`
}
