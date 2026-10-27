/** Direct Post contract. No account eligibility or live provider acceptance is implied. */
export const TIKTOK_PRIVACY_LEVELS = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'] as const
export interface TikTokCreatorCapabilities {
  creator_nickname: string
  creator_username: string
  creator_avatar_url?: string
  privacy_level_options: string[]
  comment_disabled: boolean
  duet_disabled: boolean
  stitch_disabled: boolean
  max_video_post_duration_sec: number
}
const booleans = ['consent', 'disable_comment', 'disable_duet', 'disable_stitch', 'commercial_disclosure', 'brand_content_toggle', 'brand_organic_toggle', 'is_aigc', 'auto_add_music']
const fields = new Set([...booleans, 'consentPayload', 'consentAccountId', 'privacy_level', 'title', 'photo_cover_index', 'video_cover_timestamp_ms'])
export function normalizeTikTokOptions(raw: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(raw)) {
    if (!fields.has(key)) throw new Error(`Unsupported TikTok option: ${key}`)
    if (booleans.includes(key) && typeof value !== 'boolean') throw new Error(`TikTok ${key} must be a boolean`)
    if (['consentPayload', 'consentAccountId'].includes(key) && (typeof value !== 'string' || value.length > 65536)) throw new Error('Invalid TikTok consent binding')
    if (key === 'privacy_level' && !TIKTOK_PRIVACY_LEVELS.includes(value as any)) throw new Error('Choose an explicit TikTok privacy level')
    if (key === 'title' && (typeof value !== 'string' || value.length > 90)) throw new Error('TikTok photo title allows 90 characters')
    if (['photo_cover_index', 'video_cover_timestamp_ms'].includes(key) && (!Number.isSafeInteger(value) || Number(value) < 0)) throw new Error(`Invalid TikTok ${key}`)
  }
  return { ...raw }
}
export function tikTokPayloadError(content: string, media: readonly { mediaType: string, durationSeconds?: number | null }[], options: Record<string, unknown>, creator?: TikTokCreatorCapabilities): string | null {
  try {
    normalizeTikTokOptions(options)
  } catch (error) {
    return (error as Error).message
  }
  const videos = media.filter(item => item.mediaType === 'video')
  if (!media.length || media.length > 35 || (videos.length && (videos.length !== 1 || media.length !== 1))) return 'TikTok requires one video or 1–35 photos, without mixed media'
  if (!TIKTOK_PRIVACY_LEVELS.includes(options.privacy_level as any)) return 'Choose an explicit TikTok privacy level'
  if (options.consent !== true) return 'TikTok Music Usage Confirmation consent is required'
  if (options.commercial_disclosure === true && options.brand_content_toggle !== true && options.brand_organic_toggle !== true) return 'Select your brand or branded content for commercial disclosure'
  if (options.brand_content_toggle === true && options.privacy_level === 'SELF_ONLY') return 'TikTok branded content cannot be private'
  if (content.length > (videos.length ? 2200 : 4000)) return `TikTok ${videos.length ? 'video caption allows 2200' : 'photo description allows 4000'} characters`
  if (!videos.length && (Number(options.photo_cover_index ?? 0) >= media.length)) return 'TikTok photo cover is outside the reviewed photo list'
  if (!videos.length && (options.disable_duet === false || options.disable_stitch === false || 'video_cover_timestamp_ms' in options)) return 'Duet, Stitch and video cover are unavailable for photos'
  if (videos.length && ('title' in options || 'photo_cover_index' in options || 'auto_add_music' in options)) return 'Photo settings are unavailable for video'
  if (creator) {
    if (!creator.privacy_level_options.includes(String(options.privacy_level))) return 'Selected privacy is no longer available for this creator'
    for (const interaction of ['comment', 'duet', 'stitch'] as const) {
      if (creator[`${interaction}_disabled`] && options[`disable_${interaction}`] === false) return `TikTok ${interaction} is disabled for this creator`
    }
    if (videos.length && (!Number.isFinite(videos[0]!.durationSeconds) || Number(videos[0]!.durationSeconds) <= 0 || Number(videos[0]!.durationSeconds) > Math.min(600, creator.max_video_post_duration_sec))) return 'Video duration must be known and within the current creator limit'
  }
  return null
}
