// Module-scope singleton state for ad preview
const previewState = reactive({
  mediaUrl: '',
  mediaType: 'image' as 'image' | 'video',
  pageName: 'Your Brand',
  primaryText: 'Check out our latest offer! Limited time only.',
  headline: 'Amazing Product',
  description: 'Shop the best deals online today.',
  ctaType: 'LEARN_MORE' as string,
  linkUrl: 'https://example.com',
  visiblePlatforms: {
    metaFeed: true,
    metaStory: true,
    tiktok: true,
    youtube: true,
    linkedin: true,
    snapchat: true,
    pinterest: true,
    x: true,
  } as Record<string, boolean>,
})

const CTA_OPTIONS = [
  { label: 'Learn More', value: 'LEARN_MORE' },
  { label: 'Shop Now', value: 'SHOP_NOW' },
  { label: 'Sign Up', value: 'SIGN_UP' },
  { label: 'Contact Us', value: 'CONTACT_US' },
  { label: 'Download', value: 'DOWNLOAD' },
  { label: 'Get Offer', value: 'GET_OFFER' },
  { label: 'Book Now', value: 'BOOK_NOW' },
  { label: 'Apply Now', value: 'APPLY_NOW' },
  { label: 'Subscribe', value: 'SUBSCRIBE' },
  { label: 'Watch More', value: 'WATCH_MORE' },
]

const PLATFORM_LIST = [
  { key: 'metaFeed', label: 'Meta Feed', icon: 'i-lucide-facebook' },
  { key: 'metaStory', label: 'Meta Story', icon: 'i-lucide-smartphone' },
  { key: 'tiktok', label: 'TikTok', icon: 'i-lucide-music' },
  { key: 'youtube', label: 'YouTube', icon: 'i-lucide-youtube' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'i-lucide-linkedin' },
  { key: 'snapchat', label: 'Snapchat', icon: 'i-lucide-ghost' },
  { key: 'pinterest', label: 'Pinterest', icon: 'i-lucide-pin' },
  { key: 'x', label: 'X (Twitter)', icon: 'i-lucide-twitter' },
]

export function useAdPreview() {
  function ctaLabel(value: string): string {
    return CTA_OPTIONS.find(o => o.value === value)?.label || value.replace(/_/g, ' ')
  }

  function resetState() {
    previewState.mediaUrl = ''
    previewState.mediaType = 'image'
    previewState.pageName = 'Your Brand'
    previewState.primaryText = 'Check out our latest offer! Limited time only.'
    previewState.headline = 'Amazing Product'
    previewState.description = 'Shop the best deals online today.'
    previewState.ctaType = 'LEARN_MORE'
    previewState.linkUrl = 'https://example.com'
  }

  function setMedia(url: string, type: 'image' | 'video' = 'image') {
    previewState.mediaUrl = url
    previewState.mediaType = type
  }

  return {
    state: previewState,
    CTA_OPTIONS,
    PLATFORM_LIST,
    ctaLabel,
    resetState,
    setMedia,
  }
}
