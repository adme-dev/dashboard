export const GOOGLE_ADS_API_VERSION = 'v25' as const
export const GOOGLE_ADS_API_ORIGIN = 'https://googleads.googleapis.com' as const
export const GOOGLE_ADS_BASE_URL = `${GOOGLE_ADS_API_ORIGIN}/${GOOGLE_ADS_API_VERSION}` as const

export function googleAdsApiUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Google Ads API path must start with one slash')
  }

  return `${GOOGLE_ADS_BASE_URL}${path}`
}
