/**
 * Social Media Provider Registry
 *
 * Simple registry that looks up providers by platform name.
 * Providers are registered as they are implemented (Tasks 24-26).
 */

import type { SocialPostProvider, PlatformLimits } from './types'

// Import providers as they're created (Tasks 24-26)
import { facebookProvider } from './facebook'
import { instagramProvider } from './instagram'
import { tiktokProvider } from './tiktok'
import { linkedinProvider } from './linkedin'
import { youtubeProvider } from './youtube'
import { googleBusinessProvider } from './google-business'

const providers = new Map<string, SocialPostProvider>()

// Register implemented providers
providers.set('facebook', facebookProvider)
providers.set('instagram', instagramProvider)
providers.set('tiktok', tiktokProvider)
providers.set('linkedin', linkedinProvider)
providers.set('youtube', youtubeProvider)
providers.set('google-business', googleBusinessProvider)

export function getProvider(platform: string): SocialPostProvider | undefined {
  return providers.get(platform)
}

export function getProviderOrThrow(platform: string): SocialPostProvider {
  const provider = providers.get(platform)
  if (!provider) {
    throw createError({
      statusCode: 400,
      message: `Unsupported social media platform: ${platform}`,
    })
  }
  return provider
}

export function getSupportedPlatforms(): string[] {
  return Array.from(providers.keys())
}

export function registerProvider(provider: SocialPostProvider): void {
  providers.set(provider.identifier, provider)
}

/** Platform content limits (static, doesn't need provider instance) */
export const PLATFORM_LIMITS: Record<string, PlatformLimits> = {
  facebook: {
    maxTextLength: 63206,
    maxImages: 10,
    maxVideoSizeMB: 10240,
    supportedMediaTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
    supportsCarousel: true,
    supportsReels: true,
    supportsStories: true,
  },
  instagram: {
    maxTextLength: 2200,
    maxImages: 10,
    maxVideoSizeMB: 3600,
    supportedMediaTypes: ['image/jpeg', 'image/png', 'video/mp4'],
    supportsCarousel: true,
    supportsReels: true,
    supportsStories: true,
  },
  tiktok: {
    maxTextLength: 2200,
    maxImages: 35,
    maxVideoSizeMB: 4096,
    supportedMediaTypes: ['image/jpeg', 'image/png', 'video/mp4', 'video/webm'],
    supportsCarousel: false,
    supportsReels: false,
    supportsStories: false,
  },
  linkedin: {
    maxTextLength: 3000,
    maxImages: 9,
    maxVideoSizeMB: 5120,
    supportedMediaTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
    supportsCarousel: true,
    supportsReels: false,
    supportsStories: false,
  },
  youtube: {
    maxTextLength: 5000,
    maxImages: 0,
    maxVideoSizeMB: 256000,
    supportedMediaTypes: ['video/mp4', 'video/webm', 'video/avi'],
    supportsCarousel: false,
    supportsReels: false,
    supportsStories: false,
  },
  'google-business': {
    maxTextLength: 1500,
    maxImages: 10,
    maxVideoSizeMB: 75,
    supportedMediaTypes: ['image/jpeg', 'image/png', 'video/mp4'],
    supportsCarousel: false,
    supportsReels: false,
    supportsStories: false,
  },
}
