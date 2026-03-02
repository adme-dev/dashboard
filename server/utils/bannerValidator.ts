/**
 * Banner platform validation rules.
 * Validates banners against Google Ads, Meta, and IAB specs.
 */

export interface ValidationRule {
  id: string
  platform: 'google' | 'meta' | 'iab' | 'general'
  severity: 'error' | 'warning' | 'info'
  message: string
  fix?: string
}

export interface BannerValidationResult {
  formatKey: string
  rules: ValidationRule[]
  passed: number
  warnings: number
  errors: number
}

// Google Ads display ad requirements
const GOOGLE_MAX_FILE_SIZE = 150 * 1024 // 150KB
const GOOGLE_MAX_ANIMATION_DURATION = 30 // seconds
const GOOGLE_ACCEPTED_SIZES = new Set([
  '300x250', '336x280', '728x90', '300x600', '320x50',
  '320x100', '468x60', '970x90', '970x250', '250x250',
  '200x200', '120x600', '160x600', '300x50', '300x100',
])

// Meta ad specs
const META_MAX_IMAGE_SIZE = 30 * 1024 * 1024 // 30MB
const META_ASPECT_RATIOS: Record<string, { min: number; max: number }> = {
  feed: { min: 0.8, max: 1.91 },    // 4:5 to 1.91:1
  stories: { min: 0.5625, max: 0.5625 }, // 9:16
  reels: { min: 0.5625, max: 0.5625 },
}

// IAB standard ad sizes
const IAB_STANDARD_SIZES = new Set([
  '300x250', '728x90', '160x600', '300x600', '970x250',
  '970x90', '320x50', '320x100', '300x100',
])

export interface BannerValidationInput {
  formatKey: string
  width: number
  height: number
  fileSize?: number
  animationDuration?: number
  hasClickTag?: boolean
  layerCount?: number
  hasText?: boolean
  textRatio?: number // 0-1 ratio of text overlay area
}

export function validateBanner(input: BannerValidationInput): BannerValidationResult {
  const rules: ValidationRule[] = []
  const sizeKey = `${input.width}x${input.height}`
  const aspectRatio = input.width / input.height

  // ── Google Ads Rules ──
  if (input.fileSize && input.fileSize > GOOGLE_MAX_FILE_SIZE) {
    rules.push({
      id: 'google-file-size',
      platform: 'google',
      severity: 'error',
      message: `File size (${Math.round(input.fileSize / 1024)}KB) exceeds Google Ads limit of 150KB`,
      fix: 'Reduce image quality, simplify layers, or remove heavy assets',
    })
  } else if (input.fileSize && input.fileSize > GOOGLE_MAX_FILE_SIZE * 0.8) {
    rules.push({
      id: 'google-file-size-warn',
      platform: 'google',
      severity: 'warning',
      message: `File size (${Math.round(input.fileSize / 1024)}KB) is close to Google Ads 150KB limit`,
      fix: 'Consider optimizing assets to reduce file size',
    })
  }

  if (input.animationDuration && input.animationDuration > GOOGLE_MAX_ANIMATION_DURATION) {
    rules.push({
      id: 'google-animation-duration',
      platform: 'google',
      severity: 'error',
      message: `Animation duration (${input.animationDuration}s) exceeds Google Ads 30s limit`,
      fix: 'Shorten animation timeline to 30 seconds or less',
    })
  }

  if (!GOOGLE_ACCEPTED_SIZES.has(sizeKey)) {
    rules.push({
      id: 'google-size',
      platform: 'google',
      severity: 'warning',
      message: `${sizeKey} is not a standard Google Ads display size`,
      fix: 'Use standard sizes: 300x250, 728x90, 300x600, 320x50, etc.',
    })
  }

  if (input.hasClickTag === false) {
    rules.push({
      id: 'google-click-tag',
      platform: 'google',
      severity: 'warning',
      message: 'No click-through URL configured — Google Ads requires a clickTag',
      fix: 'Add a click-through URL in the publish settings',
    })
  }

  // ── Meta Rules ──
  if (input.fileSize && input.fileSize > META_MAX_IMAGE_SIZE) {
    rules.push({
      id: 'meta-file-size',
      platform: 'meta',
      severity: 'error',
      message: `File size exceeds Meta's 30MB limit`,
    })
  }

  if (input.textRatio && input.textRatio > 0.2) {
    rules.push({
      id: 'meta-text-ratio',
      platform: 'meta',
      severity: 'warning',
      message: `Text covers ${Math.round(input.textRatio * 100)}% of the image — Meta recommends <20% text overlay`,
      fix: 'Reduce text size or move text to ad copy instead of the image',
    })
  }

  // Check Meta feed aspect ratio
  if (aspectRatio < 0.8 || aspectRatio > 1.91) {
    rules.push({
      id: 'meta-aspect-ratio',
      platform: 'meta',
      severity: 'info',
      message: `Aspect ratio ${aspectRatio.toFixed(2)}:1 may not display optimally in Meta feeds (recommended 4:5 to 1.91:1)`,
    })
  }

  // ── IAB Rules ──
  if (IAB_STANDARD_SIZES.has(sizeKey)) {
    rules.push({
      id: 'iab-compliant',
      platform: 'iab',
      severity: 'info',
      message: `${sizeKey} is an IAB standard ad size`,
    })
  }

  // ── General Rules ──
  if (input.layerCount && input.layerCount > 20) {
    rules.push({
      id: 'general-complexity',
      platform: 'general',
      severity: 'warning',
      message: `High layer count (${input.layerCount}) may impact rendering performance`,
      fix: 'Consider merging or simplifying layers',
    })
  }

  if (!input.fileSize) {
    rules.push({
      id: 'general-no-size',
      platform: 'general',
      severity: 'info',
      message: 'File size unknown — publish or export to check actual size',
    })
  }

  const errors = rules.filter(r => r.severity === 'error').length
  const warnings = rules.filter(r => r.severity === 'warning').length

  return {
    formatKey: input.formatKey,
    rules,
    passed: rules.length - errors - warnings,
    warnings,
    errors,
  }
}
