export interface SocialInboxIdentityInput {
  platform: string | null | undefined
  name: string | null | undefined
}

export interface SocialInboxAccountContextInput {
  accountName?: string | null
  platformAccountId?: string | null
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
    const network = platform === 'instagram' ? 'Instagram' : 'Facebook'
    return {
      label: `Unidentified ${network} user`,
      unavailable: true,
      reason: 'Meta did not provide this user profile for the interaction.'
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
  if (accountName) return accountName

  const platformAccountId = input.platformAccountId?.trim()
  return platformAccountId || null
}
