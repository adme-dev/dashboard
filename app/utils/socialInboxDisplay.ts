export interface SocialInboxIdentityInput {
  platform: string | null | undefined
  name: string | null | undefined
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
      label: `${network} user unavailable`,
      unavailable: true,
      reason: 'Meta did not provide this user profile for the interaction.'
    }
  }

  if (platform === 'google-business') {
    return {
      label: 'Google reviewer unavailable',
      unavailable: true,
      reason: 'Google Business Profile did not provide a reviewer display name for this review.'
    }
  }

  return {
    label: 'Unknown user',
    unavailable: true,
    reason: 'The platform did not provide a display name for this interaction.'
  }
}
