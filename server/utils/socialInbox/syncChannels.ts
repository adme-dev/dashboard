export type SocialInboxPollChannel = 'comment' | 'dm' | 'review'

const POLL_CHANNELS: Record<string, SocialInboxPollChannel[]> = {
  'facebook': ['comment', 'review'],
  'instagram': ['comment'],
  'youtube': ['comment'],
  'linkedin': ['comment'],
  'tiktok': ['comment'],
  'google-business': ['review']
}

export function getSocialInboxPollChannels(
  platform: string | null | undefined,
  options: { messagingEnabled?: boolean } = {}
): SocialInboxPollChannel[] {
  const channels = [...(POLL_CHANNELS[(platform || '').toLowerCase()] ?? [])]
  if ((platform || '').toLowerCase() === 'facebook' && options.messagingEnabled) {
    channels.splice(1, 0, 'dm')
  }
  return channels
}
