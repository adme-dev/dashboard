import { tikTokPayloadError } from './tiktokPosting'
// server/utils/socialPublishing/effectivePayload.ts
// Copy/link/option composition shared by every publishing path, plus the deterministic per-target
// "effective payload" of a reviewed (delegated) revision.
//
// Submission validation, the frozen review projection and dispatch all call
// resolveEffectiveSocialTargets() on the same snapshot, so what is validated, what the reviewer sees and
// what the provider receives cannot drift. Precedence: a target's own options override the platform
// override's options, which override nothing else; account-derived options (LinkedIn author, GBP location)
// are added at dispatch. Pure — no DB, provider or runtime imports.

export interface PlatformOverride {
  content?: string
  mediaUrls?: string[]
  options?: Record<string, unknown>
}

export interface BaseContent {
  content: string
  mediaUrls: string[]
}

/** Resolve the content for one platform: per-network override merged over the base. */
export function resolvePlatformContent(
  base: BaseContent,
  overrides: Record<string, PlatformOverride>,
  platform: string
): BaseContent {
  const ov = overrides?.[platform]
  if (!ov) return { content: base.content, mediaUrls: base.mediaUrls }
  return {
    content: ov.content ?? base.content,
    mediaUrls: ov.mediaUrls ?? base.mediaUrls
  }
}

export function resolvePlatformOptions(
  overrides: Record<string, PlatformOverride>,
  platform: string
): Record<string, unknown> {
  return overrides?.[platform]?.options ?? {}
}

/** Append UTM tracking params to an outbound link. Returns null for a null url, original on parse failure. */
export function stampUtms(url: string | null, platform: string, postId: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', platform)
    u.searchParams.set('utm_medium', 'social')
    u.searchParams.set('utm_campaign', `post_${postId}`)
    return u.toString()
  } catch {
    return url
  }
}

export function buildPublishOptions(
  platform: string,
  targetOptions: Record<string, unknown>,
  link: string | null
): Record<string, unknown> {
  const options = { ...targetOptions }
  if (!link) return options

  if (platform === 'facebook') {
    options.link = link
  }

  if (platform === 'google-business' && !options.callToAction) {
    options.callToAction = { actionType: 'LEARN_MORE', url: link }
  }

  return options
}

export function buildPublishContent(platform: string, content: string, link: string | null, hasMedia = false): string {
  // Facebook photo/video posts attach media instead of a link preview. Keep their
  // tracked destination in the caption so readers can still visit the advertiser.
  if (!link || (platformSupportsStructuredLink(platform) && !(platform === 'facebook' && hasMedia))) return content
  return `${content}\n${link}`
}

function platformSupportsStructuredLink(platform: string): boolean {
  return platform === 'facebook' || platform === 'google-business'
}

// ---------------------------------------------------------------------------------------------------
// Reviewed (delegated) effective payload

/** Provider limits enforced before review so approved text is never truncated at execution. */
export const SOCIAL_EFFECTIVE_LIMITS = Object.freeze({
  linkedinPost: 3000,
  linkedinComment: 1250,
  instagramCaption: 2200,
  instagramHashtags: 30
})

export interface ReviewedSnapshotInput {
  postId: string
  content?: string | null
  linkUrl?: string | null
  hashtags?: readonly string[] | null
  firstComment?: string | null
  targets?: ReadonlyArray<{ platform: string, accountId: string, options?: Record<string, unknown> }> | null
  platformOverrides?: Record<string, unknown> | null
}

export interface ReviewedMediaInput {
  mediaType: 'image' | 'video' | string
}

export interface EffectiveSocialTarget {
  /** `${platform}:${accountId}` — the result key dispatch uses for this target. */
  key: string
  platform: string
  accountId: string
  /** What the provider publishes: post | story | reel (Instagram); text | link | image | multi_image | video. */
  mode: string
  /** Exact delivered copy, with hashtags and the tracked link composed in. */
  content: string
  /** Options the provider receives (target over platform override), including composed link options. */
  options: Record<string, unknown>
  /** UTM-stamped destination, or null. */
  link: string | null
  hashtags: string[]
  firstComment: string | null
  /** Plain-language notes about how this destination renders the reviewed post. */
  notes: string[]
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Hashtags are delivered as part of the copy, after the body and before the tracked link. */
export function composeHashtagCopy(content: string, hashtags: readonly string[]): string {
  const tags = hashtags.map(tag => `#${tag.replace(/^#+/, '')}`).filter(tag => tag.length > 1)
  if (!tags.length) return content
  return content.trim() ? `${content}\n\n${tags.join(' ')}` : tags.join(' ')
}

function mediaMode(platform: string, media: readonly ReviewedMediaInput[], options: Record<string, unknown>, link: string | null): string {
  const videos = media.filter(item => item.mediaType === 'video').length
  if (platform === 'instagram') {
    const type = typeof options.type === 'string' ? options.type : 'post'
    if (type === 'story' || type === 'reel') return type
    // A single video without an explicit type is published as a reel by the adapter.
    return videos && media.length === 1 ? 'reel' : media.length > 1 ? 'carousel' : 'post'
  }
  if (!media.length) return link && platform === 'facebook' ? 'link' : 'text'
  if (videos) return 'video'
  return media.length > 1 ? 'multi_image' : 'image'
}

/**
 * Resolve every exact target of a reviewed snapshot into the payload its provider will receive.
 * Deterministic in the snapshot (the UTM campaign uses the post id), so a frozen revision always
 * resolves to the same effective payload at review and at dispatch.
 */
export function resolveEffectiveSocialTargets(
  snapshot: ReviewedSnapshotInput,
  media: readonly ReviewedMediaInput[]
): EffectiveSocialTarget[] {
  const overrides = objectValue(snapshot.platformOverrides) as Record<string, PlatformOverride>
  const hashtags = Array.isArray(snapshot.hashtags) ? snapshot.hashtags.filter(tag => typeof tag === 'string' && tag) : []
  const firstComment = textValue(snapshot.firstComment).trim() || null
  const targets = Array.isArray(snapshot.targets) ? snapshot.targets : []
  return targets.map((target) => {
    const platform = target.platform
    const override = objectValue(overrides[platform])
    const options = { ...objectValue(override.options), ...objectValue(target.options) }
    const link = stampUtms(snapshot.linkUrl ?? null, platform, snapshot.postId)
    const base = typeof override.content === 'string' ? override.content : textValue(snapshot.content)
    const mode = mediaMode(platform, media, options, link)
    const notes: string[] = []

    if (platform === 'instagram' && mode === 'story') {
      // Stories publish the media only: the Graph API takes no caption, link or comment for them.
      notes.push('Stories publish the media only; caption, hashtags, link and first comment are not delivered.')
      return {
        key: `${platform}:${target.accountId}`,
        platform,
        accountId: target.accountId,
        mode,
        content: '',
        options,
        link: null,
        hashtags: [],
        firstComment: null,
        notes
      }
    }

    const content = buildPublishContent(platform, composeHashtagCopy(base, hashtags), link, media.length > 0)
    if (link && platform === 'facebook' && !media.length) notes.push('The link is attached as a link preview.')
    else if (link) notes.push('The tracked link is added to the end of the copy.')
    return {
      key: `${platform}:${target.accountId}`,
      platform,
      accountId: target.accountId,
      mode,
      content,
      options: buildPublishOptions(platform, options, link),
      link,
      hashtags: [...hashtags],
      firstComment,
      notes
    }
  })
}

/**
 * Reject reviewed payloads a provider would truncate, drop or publish differently from what was approved.
 * Returns the first problem in plain language, or null when every target delivers exactly.
 */
export function effectiveSocialPayloadError(
  targets: readonly EffectiveSocialTarget[],
  media: readonly ReviewedMediaInput[]
): string | null {
  const videos = media.filter(item => item.mediaType === 'video').length
  for (const target of targets) {
    if (target.platform === 'tiktok') {
      if (target.firstComment) return 'TikTok first comments are not supported by reviewed publishing'
      const error = tikTokPayloadError(target.content, media, target.options)
      if (error) return error
      if (target.options.consentPayload !== tikTokConsentIdentity(target, media)) return 'TikTok consent must be renewed for this exact payload'
    } else if (target.platform === 'instagram') {
      const type = typeof target.options.type === 'string' ? target.options.type : 'post'
      if ((type === 'story' || type === 'reel') && media.length !== 1) {
        return `Instagram ${type === 'story' ? 'stories' : 'reels'} take exactly one media item`
      }
      if (type === 'reel' && !videos) return 'Instagram reels require a video'
      if (type === 'story' && Array.isArray(target.options.collaborators) && target.options.collaborators.length) {
        return 'Instagram stories do not support collaborators'
      }
      if (target.content.length > SOCIAL_EFFECTIVE_LIMITS.instagramCaption) {
        return `Instagram captions allow ${SOCIAL_EFFECTIVE_LIMITS.instagramCaption} characters including hashtags and link (this one is ${target.content.length})`
      }
      if (target.hashtags.length > SOCIAL_EFFECTIVE_LIMITS.instagramHashtags) {
        return `Instagram allows ${SOCIAL_EFFECTIVE_LIMITS.instagramHashtags} hashtags`
      }
    } else if (target.platform === 'linkedin') {
      if (target.content.length > SOCIAL_EFFECTIVE_LIMITS.linkedinPost) {
        return `LinkedIn posts allow ${SOCIAL_EFFECTIVE_LIMITS.linkedinPost} characters including hashtags and link (this one is ${target.content.length})`
      }
      if (target.firstComment && target.firstComment.length > SOCIAL_EFFECTIVE_LIMITS.linkedinComment) {
        return `LinkedIn first comments allow ${SOCIAL_EFFECTIVE_LIMITS.linkedinComment} characters (this one is ${target.firstComment.length})`
      }
    }
  }
  return null
}

/** Exact, stable attestation identity; consent itself is excluded to avoid a self-reference. */
export function tikTokConsentIdentity(target: Pick<EffectiveSocialTarget, 'accountId' | 'content' | 'options'>, media: readonly unknown[]): string {
  const { consent: _consent, consentPayload: _binding, ...options } = target.options
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value
  return JSON.stringify(canonical({v:1,accountId:target.accountId,content:target.content,media,options}))
}
