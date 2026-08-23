// ══════════════════════════════════════
// SAFE ZONES — Platform ad placement UI overlays
// ══════════════════════════════════════
// Each safe zone defines the insets (in native pixels) where platform UI
// elements obscure content. Danger zones = outside the safe rectangle.

export interface SafeZone {
  key: string
  label: string
  platform: string
  /** Native width the inset values are designed for */
  nativeWidth: number
  /** Native height the inset values are designed for */
  nativeHeight: number
  /** Pixel insets from each edge (danger zone thickness) */
  insets: { top: number; bottom: number; left: number; right: number }
}

export const SAFE_ZONES: SafeZone[] = [
  {
    key: 'fb_ig_feed_1_1',
    label: 'FB/IG Feed 1:1',
    platform: 'Facebook / Instagram',
    nativeWidth: 1080,
    nativeHeight: 1080,
    insets: { top: 100, bottom: 100, left: 100, right: 100 },
  },
  {
    key: 'ig_feed_4_5',
    label: 'IG Feed 4:5',
    platform: 'Instagram',
    nativeWidth: 1080,
    nativeHeight: 1350,
    insets: { top: 250, bottom: 250, left: 60, right: 60 },
  },
  {
    key: 'fb_ig_stories',
    label: 'FB/IG Stories',
    platform: 'Facebook / Instagram',
    nativeWidth: 1080,
    nativeHeight: 1920,
    insets: { top: 270, bottom: 380, left: 65, right: 65 },
  },
  {
    key: 'fb_ig_reels',
    label: 'FB/IG Reels',
    platform: 'Facebook / Instagram',
    nativeWidth: 1080,
    nativeHeight: 1920,
    insets: { top: 270, bottom: 670, left: 65, right: 65 },
  },
  {
    key: 'fb_feed_16_9',
    label: 'FB Feed 16:9',
    platform: 'Facebook',
    nativeWidth: 1200,
    nativeHeight: 628,
    insets: { top: 60, bottom: 60, left: 120, right: 120 },
  },
  {
    key: 'tiktok_foryou',
    label: 'TikTok For You',
    platform: 'TikTok',
    nativeWidth: 1080,
    nativeHeight: 1920,
    insets: { top: 150, bottom: 500, left: 65, right: 65 },
  },
  {
    key: 'tiktok_feed_1_1',
    label: 'TikTok Feed 1:1',
    platform: 'TikTok',
    nativeWidth: 1080,
    nativeHeight: 1080,
    insets: { top: 80, bottom: 120, left: 60, right: 60 },
  },
  {
    key: 'linkedin_feed',
    label: 'LinkedIn Feed',
    platform: 'LinkedIn',
    nativeWidth: 1200,
    nativeHeight: 627,
    insets: { top: 50, bottom: 70, left: 80, right: 80 },
  },
  {
    key: 'snapchat_story',
    label: 'Snapchat Story',
    platform: 'Snapchat',
    nativeWidth: 1080,
    nativeHeight: 1920,
    insets: { top: 200, bottom: 400, left: 65, right: 65 },
  },
  {
    key: 'youtube_bumper',
    label: 'YouTube Bumper',
    platform: 'YouTube',
    nativeWidth: 1920,
    nativeHeight: 1080,
    insets: { top: 80, bottom: 120, left: 100, right: 100 },
  },
  {
    key: 'pinterest_pin',
    label: 'Pinterest Pin',
    platform: 'Pinterest',
    nativeWidth: 1000,
    nativeHeight: 1500,
    insets: { top: 80, bottom: 150, left: 60, right: 60 },
  },
]

// ── Google Display ──
// Google display ads have no platform chrome overlay, but two things do sit on top of
// the creative: the AdChoices badge (≈19×15 px, top-right, padded) and the mandatory
// 1 px border / edge padding. Insets are absolute pixels, so each size gets its own
// zone with native dimensions equal to the format (no scaling).
const GOOGLE_DISPLAY_SIZES: { key: string; label: string; w: number; h: number }[] = [
  { key: 'mrec',      label: 'MRec 300×250',        w: 300, h: 250 },
  { key: 'leader',    label: 'Leaderboard 728×90',  w: 728, h: 90 },
  { key: 'half',      label: 'Half Page 300×600',   w: 300, h: 600 },
  { key: 'wsky',      label: 'Wide Sky 160×600',    w: 160, h: 600 },
  { key: 'billboard', label: 'Billboard 970×250',   w: 970, h: 250 },
  { key: 'mob_ban',   label: 'Mobile 320×50',       w: 320, h: 50 },
  { key: 'mob_lg',    label: 'Mobile 320×100',      w: 320, h: 100 },
]
for (const g of GOOGLE_DISPLAY_SIZES) {
  const badge = g.h <= 60 ? 14 : 20 // AdChoices badge footprint incl. margin
  SAFE_ZONES.push({
    key: `google_${g.key}`,
    label: `Google Display · ${g.label}`,
    platform: 'Google Display',
    nativeWidth: g.w,
    nativeHeight: g.h,
    insets: { top: badge, right: badge + 4, bottom: 4, left: 4 },
  })
}

/** Lookup map: safe zone key → SafeZone object */
export const SAFE_ZONE_MAP: Record<string, SafeZone> = Object.fromEntries(
  SAFE_ZONES.map(z => [z.key, z]),
)

/**
 * Maps FORMATS keys (from banner-constants.ts) to applicable safe zone keys.
 * Formats with multiple applicable zones (e.g. 9:16 → Stories vs Reels) list all options.
 * Formats with no applicable zones are omitted.
 */
export const FORMAT_SAFE_ZONE_MAP: Record<string, string[]> = {
  // Google Display (AdChoices badge + border padding)
  mrec: ['google_mrec'],
  leader: ['google_leader'],
  half: ['google_half'],
  wsky: ['google_wsky'],
  billboard: ['google_billboard'],
  mob_ban: ['google_mob_ban'],
  mob_lg: ['google_mob_lg'],
  // Facebook
  fb_feed:  ['fb_feed_16_9'],
  fb_sq:    ['fb_ig_feed_1_1'],
  fb_story: ['fb_ig_stories', 'fb_ig_reels'],
  // Instagram
  ig_sq:    ['fb_ig_feed_1_1'],
  ig_port:  ['ig_feed_4_5'],
  ig_story: ['fb_ig_stories', 'fb_ig_reels'],
  // TikTok
  tt_feed:  ['tiktok_foryou', 'fb_ig_stories'],
  tt_sq:    ['tiktok_feed_1_1'],
  // LinkedIn
  li_feed:  ['linkedin_feed'],
  li_sq:    ['fb_ig_feed_1_1'],
  li_story: ['snapchat_story', 'fb_ig_stories'],
  li_carousel: ['fb_ig_feed_1_1'],
}
