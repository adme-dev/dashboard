import type { BannerFormat, AnimPreset, AnimOutPreset, BannerSetDef, ElementCategory, PlatformMeta, Layer } from '~/types/banner-studio'

// ══════════════════════════════════════
// FORMATS — 23 ad sizes
// ══════════════════════════════════════
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

// ══════════════════════════════════════
// PLATFORM METADATA
// ══════════════════════════════════════
export const PLATFORM_META: Record<string, PlatformMeta> = {
  Google:    { color: '#4285f4', bg: 'rgba(66,133,244,0.12)',  label: 'Google Display' },
  Facebook:  { color: '#1877f2', bg: 'rgba(24,119,242,0.12)',  label: 'Facebook' },
  Instagram: { color: '#e1306c', bg: 'rgba(225,48,108,0.12)',  label: 'Instagram' },
  TikTok:    { color: '#ff0050', bg: 'rgba(255,0,80,0.12)',    label: 'TikTok' },
  LinkedIn:  { color: '#0a66c2', bg: 'rgba(10,102,194,0.12)',  label: 'LinkedIn' },
}

// ══════════════════════════════════════
// ANIMATION PRESETS
// ══════════════════════════════════════
export const ANIM_IN: AnimPreset[] = [
  { id: 'none',     label: 'None',      icon: '○', from: {} },
  { id: 'fadeIn',   label: 'Fade',      icon: '◐', from: { opacity: 0 } },
  { id: 'slideL',   label: '← Slide',   icon: '←', from: { x: -60, opacity: 0 } },
  { id: 'slideR',   label: '→ Slide',   icon: '→', from: { x: 60, opacity: 0 } },
  { id: 'slideU',   label: '↑ Slide',   icon: '↑', from: { y: 40, opacity: 0 } },
  { id: 'slideD',   label: '↓ Slide',   icon: '↓', from: { y: -40, opacity: 0 } },
  { id: 'zoomIn',   label: 'Zoom In',   icon: '⊕', from: { scale: 0.6, opacity: 0 } },
  { id: 'zoomOut',  label: 'Zoom Out',  icon: '⊖', from: { scale: 1.4, opacity: 0 } },
  { id: 'spinIn',   label: 'Spin',      icon: '↻', from: { rotation: -15, scale: 0.8, opacity: 0 } },
  { id: 'bounceIn', label: 'Bounce',    icon: '⤴', from: { y: 50, opacity: 0 } },
  { id: 'elastic',  label: 'Elastic',   icon: '~', from: { scale: 0, opacity: 0 } },
  { id: 'kenBurns', label: 'Ken Burns', icon: '⟷', from: {}, special: 'kenBurns' },
]

// Exit animation presets — `to` defines the end state for GSAP .to()
export const ANIM_OUT: AnimOutPreset[] = [
  { id: 'none',     label: 'None',      icon: '○', to: {} },
  { id: 'fadeOut',   label: 'Fade',      icon: '◐', to: { opacity: 0 } },
  { id: 'slideL',   label: '← Slide',   icon: '←', to: { x: -60, opacity: 0 } },
  { id: 'slideR',   label: '→ Slide',   icon: '→', to: { x: 60, opacity: 0 } },
  { id: 'slideU',   label: '↑ Slide',   icon: '↑', to: { y: -40, opacity: 0 } },
  { id: 'slideD',   label: '↓ Slide',   icon: '↓', to: { y: 40, opacity: 0 } },
  { id: 'zoomIn',   label: 'Zoom In',   icon: '⊕', to: { scale: 1.4, opacity: 0 } },
  { id: 'zoomOut',  label: 'Zoom Out',  icon: '⊖', to: { scale: 0.6, opacity: 0 } },
  { id: 'spinOut',  label: 'Spin',      icon: '↻', to: { rotation: 15, scale: 0.8, opacity: 0 } },
]

export const EASES: { id: string; label: string; category: string; cp: [number, number, number, number] }[] = [
  // Out (deceleration — entrance animations)
  { id: 'power1.out', label: 'P1', category: 'out', cp: [0.25, 0.1, 0.25, 1] },
  { id: 'power2.out', label: 'P2', category: 'out', cp: [0, 0, 0.58, 1] },
  { id: 'power3.out', label: 'P3', category: 'out', cp: [0.215, 0.61, 0.355, 1] },
  { id: 'sine.out', label: 'Sine', category: 'out', cp: [0.39, 0.575, 0.565, 1] },
  { id: 'expo.out', label: 'Expo', category: 'out', cp: [0.19, 1, 0.22, 1] },
  { id: 'circ.out', label: 'Circ', category: 'out', cp: [0.075, 0.82, 0.165, 1] },
  { id: 'back.out(1.7)', label: 'Back', category: 'out', cp: [0.175, 0.885, 0.32, 1.275] },
  // In (acceleration — exit animations)
  { id: 'power1.in', label: 'P1', category: 'in', cp: [0.42, 0, 1, 1] },
  { id: 'power2.in', label: 'P2', category: 'in', cp: [0.55, 0.085, 0.68, 0.53] },
  { id: 'power3.in', label: 'P3', category: 'in', cp: [0.645, 0.045, 0.355, 1] },
  { id: 'sine.in', label: 'Sine', category: 'in', cp: [0.47, 0, 0.745, 0.715] },
  // InOut (symmetric)
  { id: 'power1.inOut', label: 'P1', category: 'inOut', cp: [0.42, 0, 0.58, 1] },
  { id: 'power2.inOut', label: 'P2', category: 'inOut', cp: [0.455, 0.03, 0.515, 0.955] },
  { id: 'sine.inOut', label: 'Sine', category: 'inOut', cp: [0.445, 0.05, 0.55, 0.95] },
  // Special
  { id: 'none', label: 'Linear', category: 'special', cp: [0, 0, 1, 1] },
  { id: 'bounce.out', label: 'Bounce', category: 'special', cp: [0.34, 1.56, 0.64, 1] },
  { id: 'elastic.out(1,0.5)', label: 'Elastic', category: 'special', cp: [0.68, -0.55, 0.265, 1.55] },
]

// Helper to generate SVG path from cubic-bezier control points
export function easeSvgPath(cp: [number, number, number, number]): string {
  return `M 0,20 C ${cp[0] * 32},${(1 - cp[1]) * 20} ${cp[2] * 32},${(1 - cp[3]) * 20} 32,0`
}

// Grouped eases for popover grid
export const EASE_GROUPS = [
  { label: 'Out', items: EASES.filter(e => e.category === 'out') },
  { label: 'In', items: EASES.filter(e => e.category === 'in') },
  { label: 'InOut', items: EASES.filter(e => e.category === 'inOut') },
  { label: 'Other', items: EASES.filter(e => e.category === 'special') },
]

export const LAYER_COLORS = ['#e8c84a', '#4a8fe8', '#4ae8a0', '#e84a4a', '#c04ae8', '#e8884a', '#4ae8e0', '#88e84a']

// Type-based layer colors (Apple Motion style)
export const LAYER_TYPE_COLORS: Record<string, string> = {
  text:   '#4ae8e0',  // cyan — text layers
  image:  '#e8884a',  // orange — images
  rect:   '#c04ae8',  // purple — shapes
  button: '#4ae8a0',  // green — buttons/CTAs
  bg:     '#666666',  // gray — backgrounds
  video:  '#e84a4a',  // red — video layers
  audio:  '#e8c84a',  // gold — audio layers
}

// ══════════════════════════════════════
// BANNER SETS — preset size groupings
// ══════════════════════════════════════
export const BANNER_SETS: BannerSetDef[] = [
  { id: 'google_standard', name: 'Google Standard', keys: ['mrec', 'leader', 'half', 'wsky'], desc: 'MRec · Leader · Half Page · Wide Sky' },
  { id: 'google_all',      name: 'Google All',      keys: ['mrec', 'leader', 'half', 'wsky', 'billboard', 'mob_ban', 'mob_lg'], desc: 'All 7 Google display sizes' },
  { id: 'facebook',        name: 'Facebook',        keys: ['fb_feed', 'fb_sq', 'fb_story'], desc: 'Feed · Square · Story' },
  { id: 'instagram',       name: 'Instagram',       keys: ['ig_sq', 'ig_port', 'ig_story', 'ig_land'], desc: 'Square · Portrait · Story · Land' },
  { id: 'social_all',      name: 'Social All',      keys: ['fb_feed', 'fb_sq', 'fb_story', 'ig_sq', 'ig_port', 'ig_story', 'tt_feed', 'tt_sq', 'li_feed', 'li_sq'], desc: 'FB · IG · TikTok · LinkedIn' },
  { id: 'full_campaign',   name: 'Full Campaign',   keys: ['mrec', 'leader', 'half', 'fb_feed', 'fb_sq', 'fb_story', 'ig_sq', 'ig_story'], desc: 'Google + Facebook + Instagram' },
]

// ══════════════════════════════════════
// DEFAULT ACCENT / BG
// ══════════════════════════════════════
export const DEFAULT_ACCENT = '#e8c84a'
export const DEFAULT_BG = '#0a0a10'

// ══════════════════════════════════════
// LAYER MIGRATION — ensures presence fields
// ══════════════════════════════════════
export function migrateLayer(l: Partial<Layer>): Layer {
  if (l.startTime === undefined) l.startTime = l.delay || 0
  if (l.animInDur === undefined) l.animInDur = l.dur || 0.6
  if (l.endTime === undefined) l.endTime = (l.startTime || 0) + (l.animInDur || 0.6) + 2.5
  l.delay = l.startTime
  l.dur = l.animInDur
  if (!l.animIn) l.animIn = 'none'
  if (l.type === 'audio') {
    if (l.volume === undefined) l.volume = 1
    if (l.muted === undefined) l.muted = false
  }
  if (!l.animOut) l.animOut = 'fadeOut'
  if (!l.animOutEase) l.animOutEase = 'power1.in'
  return l as Layer
}

// ══════════════════════════════════════
// TEMPLATES
// ══════════════════════════════════════
export const TEMPLATES = [
  {
    id: 'automotive',
    name: 'Auto Sale',
    layers: (fmt: { w: number; h: number }): Partial<Layer>[] => {
      const { w, h } = fmt
      return [
        { type: 'bg', name: 'Background', bgColor: DEFAULT_BG, zIndex: 0, x: 0, y: 0, w, h, opacity: 1, animIn: 'none', delay: 0, dur: 0.8, ease: 'power2.out', locked: true },
        { type: 'rect', name: 'Accent Bar', fillColor: DEFAULT_ACCENT, zIndex: 1, x: 0, y: Math.round(h * 0.65), w: Math.round(w * 0.45), h: 3, opacity: 1, animIn: 'slideL', delay: 0.2, dur: 0.6, ease: 'power3.out' },
        { type: 'text', name: 'Headline', text: 'DRIVE AWAY', fontSize: Math.max(20, Math.round(w * 0.12)), fontWeight: 900, fontFamily: 'Barlow Condensed', color: '#fff', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.0, textAlign: 'left', zIndex: 10, x: 16, y: Math.round(h * 0.4), w: Math.round(w * 0.85), h: Math.max(28, Math.round(w * 0.14)), opacity: 1, animIn: 'slideL', delay: 0.5, dur: 0.55, ease: 'power3.out' },
        { type: 'text', name: 'Sub-copy', text: 'Save up to $8,000', fontSize: Math.max(10, Math.round(w * 0.038)), fontWeight: 400, fontFamily: 'Barlow', color: 'rgba(255,255,255,0.7)', textTransform: 'none', letterSpacing: '0', lineHeight: 1.4, textAlign: 'left', zIndex: 10, x: 16, y: Math.round(h * 0.56), w: Math.round(w * 0.75), h: Math.max(16, Math.round(w * 0.055)), opacity: 1, animIn: 'slideL', delay: 0.7, dur: 0.5, ease: 'power2.out' },
        { type: 'button', name: 'CTA Button', text: 'Book Test Drive', fontSize: Math.max(10, Math.round(w * 0.04)), fontWeight: 800, fontFamily: 'Barlow Condensed', bgColor: DEFAULT_ACCENT, textColor: '#000', borderRadius: 2, paddingH: 14, paddingV: 8, textTransform: 'uppercase', letterSpacing: '0.1em', zIndex: 12, x: 16, y: Math.round(h * 0.76), w: Math.round(w * 0.52), h: Math.max(26, Math.round(w * 0.085)), opacity: 1, animIn: 'slideU', delay: 1.0, dur: 0.45, ease: 'back.out(1.7)' },
        { type: 'text', name: 'Dealer', text: 'Horizon Toyota', fontSize: Math.max(8, Math.round(w * 0.028)), fontWeight: 700, fontFamily: 'Barlow Condensed', color: 'rgba(232,200,74,0.6)', textTransform: 'uppercase', letterSpacing: '0.12em', lineHeight: 1, textAlign: 'left', zIndex: 10, x: 16, y: Math.round(h * 0.9), w: Math.round(w * 0.6), h: 16, opacity: 1, animIn: 'fadeIn', delay: 1.3, dur: 0.4, ease: 'power1.out' },
      ]
    },
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle',
    layers: (fmt: { w: number; h: number }): Partial<Layer>[] => {
      const { w, h } = fmt
      return [
        { type: 'bg', name: 'Background', bgColor: '#0c0810', zIndex: 0, x: 0, y: 0, w, h, opacity: 1, animIn: 'none', delay: 0, dur: 0.8, ease: 'power2.out', locked: true },
        { type: 'rect', name: 'Overlay', fillColor: 'rgba(0,0,0,0.45)', zIndex: 2, x: 0, y: 0, w, h, opacity: 1, animIn: 'fadeIn', delay: 0.1, dur: 1.2, ease: 'power1.out' },
        { type: 'text', name: 'Badge', text: 'EOFY Sale', fontSize: Math.max(9, Math.round(w * 0.032)), fontWeight: 800, fontFamily: 'Barlow Condensed', color: '#000', textTransform: 'uppercase', letterSpacing: '0.16em', bgColor: DEFAULT_ACCENT, lineHeight: 1, textAlign: 'center', zIndex: 12, x: Math.round(w * 0.5) - 50, y: 12, w: 100, h: 22, opacity: 1, animIn: 'zoomIn', delay: 0.4, dur: 0.45, ease: 'back.out(1.7)' },
        { type: 'text', name: 'Headline', text: 'Drive Away Today', fontSize: Math.max(22, Math.round(w * 0.13)), fontWeight: 900, fontFamily: 'Barlow Condensed', color: '#fff', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 0.95, textAlign: 'center', zIndex: 11, x: Math.round(w * 0.05), y: Math.round(h * 0.38), w: Math.round(w * 0.9), h: Math.round(h * 0.25), opacity: 1, animIn: 'slideU', delay: 0.8, dur: 0.6, ease: 'power3.out' },
        { type: 'button', name: 'CTA', text: 'Book Test Drive', fontSize: Math.max(10, Math.round(w * 0.04)), fontWeight: 800, fontFamily: 'Barlow Condensed', bgColor: DEFAULT_ACCENT, textColor: '#000', borderRadius: 2, paddingH: 16, paddingV: 9, textTransform: 'uppercase', letterSpacing: '0.1em', zIndex: 13, x: Math.round(w / 2) - 60, y: Math.round(h * 0.72), w: 120, h: 30, opacity: 1, animIn: 'slideU', delay: 1.1, dur: 0.45, ease: 'back.out(1.7)' },
      ]
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    layers: (fmt: { w: number; h: number }): Partial<Layer>[] => {
      const { w, h } = fmt
      return [
        { type: 'bg', name: 'Background', bgColor: '#f5f0e8', zIndex: 0, x: 0, y: 0, w, h, opacity: 1, animIn: 'none', delay: 0, dur: 0.8, ease: 'power2.out', locked: true },
        { type: 'rect', name: 'Left bar', fillColor: '#1a1a1a', zIndex: 1, x: 0, y: 0, w: 3, h, opacity: 1, animIn: 'slideD', delay: 0.2, dur: 0.6, ease: 'power3.out' },
        { type: 'text', name: 'Headline', text: 'DRIVE AWAY TODAY', fontSize: Math.max(18, Math.round(w * 0.1)), fontWeight: 900, fontFamily: 'Barlow Condensed', color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 0.95, textAlign: 'left', zIndex: 10, x: 18, y: Math.round(h * 0.25), w: Math.round(w * 0.88), h: Math.round(h * 0.3), opacity: 1, animIn: 'fadeIn', delay: 0.5, dur: 0.7, ease: 'power2.out' },
        { type: 'text', name: 'Sub-copy', text: 'Save up to $8,000 on selected models', fontSize: Math.max(9, Math.round(w * 0.032)), fontWeight: 400, fontFamily: 'Barlow', color: 'rgba(26,26,26,0.65)', textTransform: 'none', letterSpacing: '0', lineHeight: 1.5, textAlign: 'left', zIndex: 10, x: 18, y: Math.round(h * 0.6), w: Math.round(w * 0.75), h: 40, opacity: 1, animIn: 'slideU', delay: 0.8, dur: 0.5, ease: 'power2.out' },
        { type: 'button', name: 'CTA', text: 'Book Test Drive', fontSize: Math.max(9, Math.round(w * 0.034)), fontWeight: 800, fontFamily: 'Barlow Condensed', bgColor: '#1a1a1a', textColor: '#f5f0e8', borderRadius: 0, paddingH: 14, paddingV: 8, textTransform: 'uppercase', letterSpacing: '0.1em', zIndex: 12, x: 18, y: Math.round(h * 0.8), w: Math.round(w * 0.45), h: 28, opacity: 1, animIn: 'slideL', delay: 1.1, dur: 0.45, ease: 'power3.out' },
      ]
    },
  },
  {
    id: 'price-hero',
    name: 'Price Hero',
    layers: (fmt: { w: number; h: number }): Partial<Layer>[] => {
      const { w, h } = fmt
      return [
        { type: 'bg', name: 'Background', bgColor: '#08080e', zIndex: 0, x: 0, y: 0, w, h, opacity: 1, animIn: 'none', delay: 0, dur: 0.8, ease: 'power2.out', locked: true },
        { type: 'text', name: 'From', text: 'FROM', fontSize: Math.max(8, Math.round(w * 0.032)), fontWeight: 600, fontFamily: 'Barlow Condensed', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.2em', lineHeight: 1, textAlign: 'center', zIndex: 10, x: 0, y: Math.round(h * 0.28), w, h: 16, opacity: 1, animIn: 'fadeIn', delay: 0.3, dur: 0.4, ease: 'power1.out' },
        { type: 'text', name: 'Price', text: '$399/wk', fontSize: Math.max(28, Math.round(w * 0.18)), fontWeight: 900, fontFamily: 'Barlow Condensed', color: DEFAULT_ACCENT, textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1, textAlign: 'center', zIndex: 11, x: 0, y: Math.round(h * 0.36), w, h: Math.round(h * 0.25), opacity: 1, animIn: 'zoomIn', delay: 0.6, dur: 0.55, ease: 'back.out(1.7)' },
        { type: 'text', name: 'Sub', text: 'Drive Away · Limited Stock', fontSize: Math.max(9, Math.round(w * 0.033)), fontWeight: 600, fontFamily: 'Barlow Condensed', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.12em', lineHeight: 1, textAlign: 'center', zIndex: 10, x: 0, y: Math.round(h * 0.64), w, h: 16, opacity: 1, animIn: 'fadeIn', delay: 0.9, dur: 0.4, ease: 'power1.out' },
        { type: 'button', name: 'CTA', text: 'Book Test Drive', fontSize: Math.max(10, Math.round(w * 0.038)), fontWeight: 800, fontFamily: 'Barlow Condensed', bgColor: DEFAULT_ACCENT, textColor: '#000', borderRadius: 2, paddingH: 16, paddingV: 9, textTransform: 'uppercase', letterSpacing: '0.1em', zIndex: 12, x: Math.round(w / 2) - 60, y: Math.round(h * 0.76), w: 120, h: 30, opacity: 1, animIn: 'bounceIn', delay: 1.1, dur: 0.6, ease: 'bounce.out' },
      ]
    },
  },
]

// ══════════════════════════════════════
// ELEMENTS LIBRARY — 23 pre-styled elements
// ══════════════════════════════════════
function maxZ(layers: Layer[]): number {
  return layers.length ? Math.max(...layers.map(l => l.zIndex)) : 0
}

export function buildElementsLibrary(getLayers: () => Layer[]): ElementCategory[] {
  const mz = () => maxZ(getLayers())

  return [
    {
      cat: 'Headlines',
      items: [
        {
          name: 'Impact Headline',
          layer: (fmt) => ({ type: 'text', name: 'Impact Headline', text: 'DRIVE AWAY TODAY', fontSize: Math.max(24, Math.round(fmt.w * 0.12)), fontWeight: 900, fontFamily: 'Barlow Condensed', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 0.95, textAlign: 'left', zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.3), w: Math.round(fmt.w * 0.9), h: Math.round(fmt.w * 0.16), opacity: 1, animIn: 'slideL', delay: 0.4, dur: 0.55, ease: 'power3.out' }),
        },
        {
          name: 'Condensed + Sub',
          layer: (fmt) => ({ type: 'text', name: 'Headline', text: 'BIG HEADLINE', fontSize: Math.max(22, Math.round(fmt.w * 0.11)), fontWeight: 900, fontFamily: 'Barlow Condensed', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1, textAlign: 'left', zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.28), w: Math.round(fmt.w * 0.85), h: Math.round(fmt.w * 0.13), opacity: 1, animIn: 'slideU', delay: 0.4, dur: 0.5, ease: 'power2.out' }),
          extra: (fmt) => [{ type: 'text', name: 'Sub-copy', text: 'Supporting copy goes here', fontSize: Math.max(10, Math.round(fmt.w * 0.036)), fontWeight: 400, fontFamily: 'Barlow', color: 'rgba(255,255,255,0.55)', textTransform: 'none', letterSpacing: '0.02em', lineHeight: 1.4, textAlign: 'left', zIndex: mz() + 2, x: 16, y: Math.round(fmt.h * 0.46), w: Math.round(fmt.w * 0.8), h: 30, opacity: 1, animIn: 'fadeIn', delay: 0.7, dur: 0.5, ease: 'power2.out' }],
        },
        {
          name: 'Accent Line Title',
          layer: (fmt) => ({ type: 'rect', name: 'Accent Rule', fillColor: DEFAULT_ACCENT, borderRadius: 0, zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.28), w: Math.round(fmt.w * 0.3), h: 3, opacity: 1, animIn: 'slideL', delay: 0.2, dur: 0.5, ease: 'power3.out' }),
          extra: (fmt) => [{ type: 'text', name: 'Headline', text: 'HEADLINE TEXT', fontSize: Math.max(20, Math.round(fmt.w * 0.1)), fontWeight: 800, fontFamily: 'Barlow Condensed', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1, textAlign: 'left', zIndex: mz() + 2, x: 16, y: Math.round(fmt.h * 0.32), w: Math.round(fmt.w * 0.85), h: Math.round(fmt.w * 0.12), opacity: 1, animIn: 'slideL', delay: 0.4, dur: 0.5, ease: 'power3.out' }],
        },
        {
          name: 'Serif-Style Italic',
          layer: (fmt) => ({ type: 'text', name: 'Serif Title', text: 'Elegant Title', fontSize: Math.max(20, Math.round(fmt.w * 0.1)), fontWeight: 700, fontFamily: 'Georgia', color: '#ffffff', textTransform: 'none', letterSpacing: '0.01em', lineHeight: 1.1, textAlign: 'center', zIndex: mz() + 1, x: 0, y: Math.round(fmt.h * 0.3), w: fmt.w, h: Math.round(fmt.w * 0.12), opacity: 1, animIn: 'fadeIn', delay: 0.5, dur: 0.8, ease: 'power1.out' }),
        },
        {
          name: 'Price Display',
          layer: (fmt) => ({ type: 'text', name: 'Price', text: '$399/wk', fontSize: Math.max(32, Math.round(fmt.w * 0.18)), fontWeight: 900, fontFamily: 'Barlow Condensed', color: DEFAULT_ACCENT, textTransform: 'none', letterSpacing: '-0.02em', lineHeight: 1, textAlign: 'center', zIndex: mz() + 1, x: 0, y: Math.round(fmt.h * 0.35), w: fmt.w, h: Math.round(fmt.h * 0.22), opacity: 1, animIn: 'zoomIn', delay: 0.5, dur: 0.55, ease: 'back.out(1.7)' }),
          extra: (fmt) => [{ type: 'text', name: 'From Label', text: 'FROM', fontSize: Math.max(9, Math.round(fmt.w * 0.03)), fontWeight: 600, fontFamily: 'Barlow Condensed', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.2em', lineHeight: 1, textAlign: 'center', zIndex: mz() + 2, x: 0, y: Math.round(fmt.h * 0.28), w: fmt.w, h: 16, opacity: 1, animIn: 'fadeIn', delay: 0.3, dur: 0.4, ease: 'power1.out' }],
        },
      ],
    },
    {
      cat: 'CTA Buttons',
      items: [
        {
          name: 'Solid Accent',
          layer: (fmt) => ({ type: 'button', name: 'CTA Solid', text: 'SHOP NOW', fontSize: Math.max(10, Math.round(fmt.w * 0.04)), fontWeight: 800, fontFamily: 'Barlow Condensed', bgColor: DEFAULT_ACCENT, textColor: '#000000', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.1em', zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.78), w: Math.round(fmt.w * 0.48), h: Math.max(28, Math.round(fmt.w * 0.09)), opacity: 1, animIn: 'slideU', delay: 1.0, dur: 0.45, ease: 'back.out(1.7)' }),
        },
        {
          name: 'Outline Ghost',
          layer: (fmt) => ({ type: 'button', name: 'CTA Outline', text: 'LEARN MORE', fontSize: Math.max(10, Math.round(fmt.w * 0.038)), fontWeight: 700, fontFamily: 'Barlow Condensed', bgColor: 'transparent', textColor: '#ffffff', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.1em', zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.78), w: Math.round(fmt.w * 0.48), h: Math.max(28, Math.round(fmt.w * 0.09)), opacity: 1, animIn: 'fadeIn', delay: 1.0, dur: 0.5, ease: 'power2.out' }),
        },
        {
          name: 'Dark Fill',
          layer: (fmt) => ({ type: 'button', name: 'CTA Dark', text: 'BOOK NOW', fontSize: Math.max(10, Math.round(fmt.w * 0.04)), fontWeight: 800, fontFamily: 'Barlow Condensed', bgColor: '#1a1a28', textColor: '#ffffff', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.1em', zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.78), w: Math.round(fmt.w * 0.48), h: Math.max(28, Math.round(fmt.w * 0.09)), opacity: 1, animIn: 'slideU', delay: 1.0, dur: 0.45, ease: 'back.out(1.7)' }),
        },
        {
          name: 'Pill Round',
          layer: (fmt) => ({ type: 'button', name: 'CTA Pill', text: 'GET OFFER', fontSize: Math.max(10, Math.round(fmt.w * 0.04)), fontWeight: 800, fontFamily: 'Barlow Condensed', bgColor: DEFAULT_ACCENT, textColor: '#000000', borderRadius: 50, textTransform: 'uppercase', letterSpacing: '0.1em', zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.78), w: Math.round(fmt.w * 0.48), h: Math.max(28, Math.round(fmt.w * 0.09)), opacity: 1, animIn: 'bounceIn', delay: 1.0, dur: 0.5, ease: 'bounce.out' }),
        },
        {
          name: 'Arrow CTA',
          layer: (fmt) => ({ type: 'text', name: 'Arrow CTA', text: 'EXPLORE ›', fontSize: Math.max(10, Math.round(fmt.w * 0.04)), fontWeight: 800, fontFamily: 'Barlow Condensed', color: DEFAULT_ACCENT, textTransform: 'uppercase', letterSpacing: '0.12em', lineHeight: 1.4, textAlign: 'left', zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.8), w: Math.round(fmt.w * 0.4), h: Math.max(22, Math.round(fmt.w * 0.06)), opacity: 1, animIn: 'slideL', delay: 1.1, dur: 0.4, ease: 'power2.out' }),
        },
        {
          name: 'White + Icon',
          layer: (fmt) => ({ type: 'button', name: 'CTA White', text: 'ENQUIRE NOW', fontSize: Math.max(10, Math.round(fmt.w * 0.04)), fontWeight: 800, fontFamily: 'Barlow Condensed', bgColor: '#ffffff', textColor: '#0a0a10', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.1em', zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.78), w: Math.round(fmt.w * 0.48), h: Math.max(28, Math.round(fmt.w * 0.09)), opacity: 1, animIn: 'slideU', delay: 1.0, dur: 0.45, ease: 'back.out(1.7)' }),
        },
      ],
    },
    {
      cat: 'Badges & Labels',
      items: [
        {
          name: 'Promo Badge',
          layer: (fmt) => ({ type: 'text', name: 'Promo Badge', text: 'EOFY SALE', fontSize: Math.max(9, Math.round(fmt.w * 0.033)), fontWeight: 800, fontFamily: 'Barlow Condensed', color: '#000000', textTransform: 'uppercase', letterSpacing: '0.16em', lineHeight: 1, textAlign: 'center', bgColor: DEFAULT_ACCENT, paddingH: 10, paddingV: 4, zIndex: mz() + 1, x: Math.round(fmt.w * 0.5) - 50, y: 14, w: 100, h: 22, opacity: 1, animIn: 'zoomIn', delay: 0.3, dur: 0.4, ease: 'back.out(1.7)' }),
        },
        {
          name: 'New Arrival Tag',
          layer: (fmt) => ({ type: 'text', name: 'Tag Label', text: 'NEW MODEL', fontSize: Math.max(9, Math.round(fmt.w * 0.03)), fontWeight: 700, fontFamily: 'Barlow Condensed', color: DEFAULT_ACCENT, textTransform: 'uppercase', letterSpacing: '0.14em', lineHeight: 1, textAlign: 'center', bgColor: 'transparent', paddingH: 10, paddingV: 4, zIndex: mz() + 1, x: 16, y: 14, w: 90, h: 22, opacity: 1, animIn: 'fadeIn', delay: 0.2, dur: 0.5, ease: 'power1.out' }),
        },
        {
          name: 'Sale % Burst',
          layer: (fmt) => ({ type: 'button', name: 'Sale Burst', text: '25% OFF', fontSize: Math.max(14, Math.round(fmt.w * 0.07)), fontWeight: 900, fontFamily: 'Barlow Condensed', bgColor: '#e84a4a', textColor: '#ffffff', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0', zIndex: mz() + 1, x: Math.round(fmt.w * 0.7), y: 14, w: Math.round(fmt.w * 0.22), h: Math.round(fmt.w * 0.22), opacity: 1, animIn: 'bounceIn', delay: 0.6, dur: 0.6, ease: 'bounce.out' }),
        },
        {
          name: 'Dealer Name',
          layer: (fmt) => ({ type: 'text', name: 'Dealer Name', text: 'HORIZON TOYOTA', fontSize: Math.max(8, Math.round(fmt.w * 0.028)), fontWeight: 700, fontFamily: 'Barlow Condensed', color: 'rgba(232,200,74,0.65)', textTransform: 'uppercase', letterSpacing: '0.16em', lineHeight: 1, textAlign: 'left', zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.9), w: Math.round(fmt.w * 0.65), h: 16, opacity: 1, animIn: 'fadeIn', delay: 1.3, dur: 0.4, ease: 'power1.out' }),
        },
        {
          name: 'T&C Disclaimer',
          layer: (fmt) => ({ type: 'text', name: 'Disclaimer', text: '*T&Cs apply. Offer ends 30 June. Drive away price. Selected models only.', fontSize: Math.max(7, Math.round(fmt.w * 0.022)), fontWeight: 400, fontFamily: 'Barlow', color: 'rgba(255,255,255,0.3)', textTransform: 'none', letterSpacing: '0', lineHeight: 1.35, textAlign: 'left', zIndex: mz() + 1, x: 8, y: Math.round(fmt.h * 0.95), w: Math.round(fmt.w * 0.96), h: 20, opacity: 1, animIn: 'fadeIn', delay: 1.5, dur: 0.5, ease: 'power1.out' }),
        },
      ],
    },
    {
      cat: 'Shapes & Overlays',
      items: [
        {
          name: 'Dark Overlay',
          layer: (fmt) => ({ type: 'rect', name: 'Dark Overlay', fillColor: 'rgba(0,0,0,0.5)', borderRadius: 0, zIndex: mz() + 1, x: 0, y: 0, w: fmt.w, h: fmt.h, opacity: 1, animIn: 'fadeIn', delay: 0, dur: 1.2, ease: 'power1.out' }),
        },
        {
          name: 'Bottom Gradient Bar',
          layer: (fmt) => ({ type: 'rect', name: 'Gradient Bar', fillColor: 'rgba(0,0,0,0.75)', borderRadius: 0, zIndex: mz() + 1, x: 0, y: Math.round(fmt.h * 0.65), w: fmt.w, h: Math.round(fmt.h * 0.35), opacity: 1, animIn: 'fadeIn', delay: 0.1, dur: 1.0, ease: 'power1.out' }),
        },
        {
          name: 'Accent Divider',
          layer: (fmt) => ({ type: 'rect', name: 'Accent Line', fillColor: DEFAULT_ACCENT, borderRadius: 1, zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.65), w: Math.round(fmt.w * 0.5), h: 2, opacity: 1, animIn: 'slideL', delay: 0.2, dur: 0.6, ease: 'power3.out' }),
        },
        {
          name: 'Vertical Accent Bar',
          layer: (fmt) => ({ type: 'rect', name: 'Vert Bar', fillColor: DEFAULT_ACCENT, borderRadius: 2, zIndex: mz() + 1, x: 0, y: 0, w: 4, h: fmt.h, opacity: 1, animIn: 'slideD', delay: 0.1, dur: 0.7, ease: 'power3.out' }),
        },
        {
          name: 'Semi-transparent Box',
          layer: (fmt) => ({ type: 'rect', name: 'Accent Box', fillColor: 'rgba(232,200,74,0.12)', borderRadius: 2, zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.4), w: Math.round(fmt.w * 0.68), h: Math.round(fmt.h * 0.2), opacity: 1, animIn: 'fadeIn', delay: 0.4, dur: 0.6, ease: 'power2.out' }),
        },
        {
          name: 'White Card Block',
          layer: (fmt) => ({ type: 'rect', name: 'White Card', fillColor: 'rgba(255,255,255,0.07)', borderRadius: 4, zIndex: mz() + 1, x: 16, y: Math.round(fmt.h * 0.2), w: Math.round(fmt.w * 0.68), h: Math.round(fmt.h * 0.55), opacity: 1, animIn: 'zoomIn', delay: 0.3, dur: 0.5, ease: 'power2.out' }),
        },
      ],
    },
    {
      cat: 'Audio',
      items: [
        {
          name: 'Sound Effect',
          layer: () => ({
            type: 'audio', name: 'Sound Effect', x: 0, y: 0, w: 0, h: 0,
            zIndex: mz() + 1, opacity: 1, volume: 1,
            animIn: 'none', startTime: 0, endTime: 3,
          }),
        },
        {
          name: 'Background Music',
          layer: () => ({
            type: 'audio', name: 'Background Music', x: 0, y: 0, w: 0, h: 0,
            zIndex: mz() + 1, opacity: 1, volume: 0.5,
            animIn: 'none', startTime: 0, endTime: 5,
          }),
        },
      ],
    },
  ]
}

// ══════════════════════════════════════
// FONT OPTIONS
// ══════════════════════════════════════
// ══════════════════════════════════════
// TEXT EFFECT PRESETS
// ══════════════════════════════════════
export const TEXT_SHADOW_PRESETS = [
  { label: 'None', value: 'none' },
  { label: 'Subtle', value: '1px 1px 2px rgba(0,0,0,0.5)' },
  { label: 'Strong', value: '2px 2px 6px rgba(0,0,0,0.8)' },
  { label: 'Glow', value: '0 0 10px rgba(255,255,255,0.8)' },
  { label: 'Custom', value: '__custom__' },
]

export const TEXT_STROKE_PRESETS = [
  { label: 'None', value: 'none' },
  { label: 'Thin', value: '0.5px #000' },
  { label: 'Medium', value: '1px #000' },
  { label: 'Thick', value: '2px #000' },
  { label: 'Custom', value: '__custom__' },
]

// ══════════════════════════════════════
// FONT OPTIONS
// ══════════════════════════════════════
export const FONT_FAMILIES = [
  'Barlow Condensed',
  'Barlow',
  'Georgia',
  'Arial',
  'Helvetica',
  'Inter',
  'Roboto',
  'Montserrat',
  'Open Sans',
  'Playfair Display',
]

export const FONT_WEIGHTS = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semi Bold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Extra Bold' },
  { value: 900, label: 'Black' },
]
