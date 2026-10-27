import type { BannerFormat } from '../app/types/banner-studio'

export const FORMATS: Record<string, BannerFormat> = {
  // Google Display
  mrec:      { key: 'mrec',      w: 300,  h: 250,  name: 'MRec',           label: '300×250 · MRec',        platform: 'Google',    icon: 'G' },
  leader:    { key: 'leader',    w: 728,  h: 90,   name: 'Leaderboard',    label: '728×90 · Leaderboard',  platform: 'Google',    icon: 'G' },
  half:      { key: 'half',      w: 300,  h: 600,  name: 'Half Page',      label: '300×600 · Half Page',   platform: 'Google',    icon: 'G' },
  wsky:      { key: 'wsky',      w: 160,  h: 600,  name: 'Wide Skyscraper', label: '160×600 · Wide Sky',   platform: 'Google',    icon: 'G' },
  billboard: { key: 'billboard', w: 970,  h: 250,  name: 'Billboard',      label: '970×250 · Billboard',   platform: 'Google',    icon: 'G' },
  mob_ban:   { key: 'mob_ban',   w: 320,  h: 50,   name: 'Mobile Banner',  label: '320×50 · Mobile',       platform: 'Google',    icon: 'G' },
  mob_lg:    { key: 'mob_lg',    w: 320,  h: 100,  name: 'Large Mobile',   label: '320×100 · Mob Large',   platform: 'Google',    icon: 'G' },
  // Facebook
  fb_feed:   { key: 'fb_feed',   w: 1200, h: 628,  name: 'Feed',           label: '1200×628 · FB Feed',    platform: 'Facebook',  icon: 'f' },
  fb_sq:     { key: 'fb_sq',     w: 1080, h: 1080, name: 'Square Feed',    label: '1080×1080 · FB Sq',     platform: 'Facebook',  icon: 'f' },
  fb_story:  { key: 'fb_story',  w: 1080, h: 1920, name: 'Story',          label: '1080×1920 · FB Story',  platform: 'Facebook',  icon: 'f' },
  fb_cover:  { key: 'fb_cover',  w: 820,  h: 312,  name: 'Cover Photo',    label: '820×312 · FB Cover',    platform: 'Facebook',  icon: 'f' },
  // Instagram
  ig_sq:     { key: 'ig_sq',     w: 1080, h: 1080, name: 'Square Feed',    label: '1080×1080 · IG Square', platform: 'Instagram', icon: '◎' },
  ig_port:   { key: 'ig_port',   w: 1080, h: 1350, name: 'Portrait Feed',  label: '1080×1350 · IG Port',   platform: 'Instagram', icon: '◎' },
  ig_story:  { key: 'ig_story',  w: 1080, h: 1920, name: 'Story / Reel',   label: '1080×1920 · IG Story',  platform: 'Instagram', icon: '◎' },
  ig_land:   { key: 'ig_land',   w: 1080, h: 566,  name: 'Landscape',      label: '1080×566 · IG Land',    platform: 'Instagram', icon: '◎' },
  // TikTok
  tt_feed:   { key: 'tt_feed',   w: 1080, h: 1920, name: 'In-Feed / TopView', label: '1080×1920 · TT Feed', platform: 'TikTok', icon: '♪' },
  tt_sq:     { key: 'tt_sq',     w: 1080, h: 1080, name: 'Square',         label: '1080×1080 · TT Square', platform: 'TikTok',    icon: '♪' },
  tt_land:   { key: 'tt_land',   w: 1280, h: 720,  name: 'Landscape',      label: '1280×720 · TT Land',    platform: 'TikTok',    icon: '♪' },
  // LinkedIn
  li_feed:   { key: 'li_feed',   w: 1200, h: 627,  name: 'Single Image',   label: '1200×627 · LI Feed',    platform: 'LinkedIn',  icon: 'in' },
  li_sq:     { key: 'li_sq',     w: 1200, h: 1200, name: 'Square',         label: '1200×1200 · LI Sq',     platform: 'LinkedIn',  icon: 'in' },
  li_story:  { key: 'li_story',  w: 1080, h: 1920, name: 'Story',          label: '1080×1920 · LI Story',  platform: 'LinkedIn',  icon: 'in' },
  li_carousel: { key: 'li_carousel', w: 1080, h: 1080, name: 'Carousel Card', label: '1080×1080 · LI Carousel', platform: 'LinkedIn', icon: 'in' },
}


/** Recover dimensions encoded by the image-importer's custom format keys. */
export function resolveBannerFormat(key: string): BannerFormat | undefined {
  if (Object.prototype.hasOwnProperty.call(FORMATS, key)) return FORMATS[key]
  const match = /^custom_([1-9]\d{0,3})x([1-9]\d{0,3})$/.exec(key)
  if (!match) return undefined
  const w = Number(match[1]), h = Number(match[2])
  return { key, w, h, name: 'Custom', label: `${w}×${h} · Custom`, platform: 'Custom', icon: 'C' }
}

