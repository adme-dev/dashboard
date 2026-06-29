import type { SocialPost } from '~/types'

export interface ApprovalReviewSummary {
  platforms: number
  media: number
  hashtags: number
  tags: number
  hasFirstComment: boolean
  hasLink: boolean
  hasOverrides: boolean
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function approvalPrimaryContent(post: SocialPost, platform: string | null): string {
  const override = platform ? post.platform_overrides?.[platform] : null
  if (hasText(override?.content)) return override.content.trim()
  if (hasText(post.content)) return post.content.trim()
  return '(no copy)'
}

export function approvalReviewSummary(post: SocialPost): ApprovalReviewSummary {
  const overrides = Object.values(post.platform_overrides ?? {})

  return {
    platforms: post.platforms?.length ?? 0,
    media: post.media_urls?.length ?? 0,
    hashtags: post.hashtags?.length ?? 0,
    tags: post.tags?.length ?? 0,
    hasFirstComment: hasText(post.first_comment),
    hasLink: hasText(post.link_url),
    hasOverrides: overrides.some(override =>
      hasText(override?.content) || ((override?.mediaUrls?.length ?? 0) > 0)
    ),
  }
}

export function formatApprovalDate(value: string | null | undefined, timezone?: string | null): string {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone || undefined,
  }).format(date)
}
