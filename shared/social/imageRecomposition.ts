export const SOCIAL_IMAGE_FORMATS = {
  portrait: { label: 'Feed portrait · 4:5', width: 1152, height: 1440 },
  square: { label: 'Square · 1:1', width: 1152, height: 1152 },
  story: { label: 'Story · 9:16', width: 1152, height: 2048 }
} as const
export type SocialImageFormat = keyof typeof SOCIAL_IMAGE_FORMATS
export interface SocialImagePreview {
  assetId: string
  url: string
  sourceUrl: string
  format: SocialImageFormat
  width: number
  height: number
}
