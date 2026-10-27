import { platformPublishingSupport } from '~~/shared/socialCapabilityReadiness'
import type { SocialPublishPlatform } from '~/types'

export interface SocialPublishingPlatformOption {
  value: SocialPublishPlatform
  label: string
  icon: string
  limit: number
  live: boolean
  connectable: boolean
  readiness: string
  docsUrl?: string
}

export const SOCIAL_PUBLISHING_PLATFORM_OPTIONS: SocialPublishingPlatformOption[] = [
  {
    value: 'facebook',
    label: 'Facebook',
    icon: 'i-lucide-facebook',
    limit: 63206,
    live: true,
    connectable: true,
    readiness: 'Ready for publishing account connection',
    docsUrl: 'https://developers.facebook.com/docs/pages-api/posts/'
  },
  {
    value: 'instagram',
    label: 'Instagram',
    icon: 'i-lucide-instagram',
    limit: 2200,
    live: true,
    connectable: false,
    readiness: 'Connects through a linked Facebook Page',
    docsUrl: 'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing/'
  },
  {
    value: 'google-business',
    label: 'Google Business',
    icon: 'i-lucide-store',
    limit: 1500,
    live: true,
    connectable: true,
    readiness: 'Ready for publishing account connection',
    docsUrl: 'https://developers.google.com/my-business/content/posts-data'
  },
  {
    value: 'linkedin',
    label: 'LinkedIn',
    icon: 'i-lucide-linkedin',
    limit: 3000,
    live: true,
    connectable: true,
    readiness: 'Ready for Company Page connection (organization admins): publishing, comments inbox, and Page analytics',
    docsUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api'
  },
  {
    value: 'tiktok',
    label: 'TikTok',
    icon: 'i-lucide-music',
    limit: 2200,
    live: false,
    connectable: false,
    readiness: platformPublishingSupport('tiktok').reason,
    docsUrl: 'https://developers.tiktok.com/doc/content-posting-api-get-started/'
  },
  {
    value: 'youtube',
    label: 'YouTube',
    icon: 'i-lucide-youtube',
    limit: 5000,
    live: false,
    connectable: false,
    readiness: 'OAuth channel discovery foundation is available; upload publishing, refresh hardening, and live provider smoke remain disabled',
    docsUrl: 'https://developers.google.com/youtube/v3/guides/uploading_a_video'
  }
].map(option => ({ ...option, live: platformPublishingSupport(option.value).productionReady, readiness: platformPublishingSupport(option.value).reason })) as SocialPublishingPlatformOption[]

export const LIVE_SOCIAL_PUBLISHING_PLATFORM_OPTIONS = SOCIAL_PUBLISHING_PLATFORM_OPTIONS
  .filter(option => option.live)

export function socialPublishingPlatformLabel(platform: string): string {
  return SOCIAL_PUBLISHING_PLATFORM_OPTIONS.find(option => option.value === platform)?.label ?? platform
}

export function socialPublishingPlatformIcon(platform: string): string {
  return SOCIAL_PUBLISHING_PLATFORM_OPTIONS.find(option => option.value === platform)?.icon ?? 'i-lucide-share-2'
}

export function socialPublishingPlatformLimit(platform: string): number {
  return SOCIAL_PUBLISHING_PLATFORM_OPTIONS.find(option => option.value === platform)?.limit ?? 99999
}

export function socialPublishingPlatformReadiness(platform: string): string {
  return SOCIAL_PUBLISHING_PLATFORM_OPTIONS.find(option => option.value === platform)?.readiness
    ?? 'Publishing readiness has not been configured'
}

export function socialPublishingPlatformConnectable(platform: string): boolean {
  return SOCIAL_PUBLISHING_PLATFORM_OPTIONS.find(option => option.value === platform)?.connectable ?? false
}
