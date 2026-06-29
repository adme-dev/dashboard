export type SocialInboxPollChannel = 'comment' | 'review'

const POLL_CHANNELS: Record<string, SocialInboxPollChannel[]> = {
  'facebook': ['comment', 'review'],
  'instagram': ['comment'],
  'youtube': ['comment'],
  'linkedin': ['comment'],
  'tiktok': ['comment'],
  'google-business': ['review']
}

export function getSocialInboxPollChannels(platform: string | null | undefined): SocialInboxPollChannel[] {
  return [...(POLL_CHANNELS[(platform || '').toLowerCase()] ?? [])]
}
