import type { ArtboardState, BannerFormat, Layer } from '../types/banner-studio'
import { migrateLayer, TEMPLATES } from './banner-constants'

export type BannerCatalogCategory = 'display' | 'social' | 'print' | 'digital' | 'video'

export interface BannerCatalogPreset {
  id: string
  name: string
  category: BannerCatalogCategory
  formats: BannerFormat[]
  description?: string
  icon: string
  note?: string
}

type FormatDefinition = [name: string, w: number, h: number, platform?: BannerFormat['platform']]

const CATEGORY_ICONS: Record<BannerCatalogCategory, string> = {
  display: 'i-lucide-monitor',
  social: 'i-lucide-message-circle',
  print: 'i-lucide-printer',
  digital: 'i-lucide-presentation',
  video: 'i-lucide-video'
}

function format([name, w, h, platform = 'Custom']: FormatDefinition): BannerFormat {
  return { key: `custom_${w}x${h}`, name, w, h, label: `${w}×${h} · ${name}`, platform, icon: platform === 'Google' ? 'G' : '◇' }
}

// Dimensions and names checked against TheBrief's live format picker, 31 October 2026.
const displayFormats: BannerFormat[] = ([
  ['Small Square', 200, 200],
  ['Vertical Rectangle', 240, 400],
  ['Square', 250, 250],
  ['Triple Widescreen', 250, 360],
  ['Inline Rectangle', 300, 250],
  ['Large Rectangle', 336, 280],
  ['Netboard', 580, 400],
  ['Skyscraper', 120, 600],
  ['Wide Skyscraper', 160, 600],
  ['Half Page', 300, 600],
  ['Portrait', 300, 1050],
  ['Main Banner', 468, 60],
  ['Leaderboard', 728, 90],
  ['Top Banner', 930, 180],
  ['Large Leaderboard', 970, 90],
  ['Billboard', 970, 250],
  ['Panorama', 980, 120],
  ['Mobile Banner', 300, 50],
  ['Mobile Leaderboard', 320, 50],
  ['Large Mobile', 320, 100],
  ['Half Banner', 234, 60],
  ['Vertical Banner', 120, 240],
  ['Small Rectangle', 180, 150]
] satisfies FormatDefinition[]).map(([name, w, h]) => format([name, w, h, 'Google']))

const performanceMaxFormats: BannerFormat[] = ([
  ['Performance Max Square', 1200, 1200, 'Google'],
  ['Performance Max Landscape', 1200, 628, 'Google'],
  ['Performance Max Portrait', 960, 1200, 'Google']
] satisfies FormatDefinition[]).map(format)

// XeroFlow selections: TheBrief exposes set counts, but not their membership.
const socialFormats: BannerFormat[] = ([
  ['Instagram Post', 1080, 1080, 'Instagram'],
  ['Facebook Square Post', 1200, 1200, 'Facebook'],
  ['Facebook Sponsored Message', 1200, 628, 'Facebook'],
  ['Story', 1080, 1920, 'Instagram'],
  ['Portrait Post', 1080, 1350, 'Instagram'],
  ['X Image Post', 1200, 600],
  ['Pinterest Pin', 1000, 1500],
  ['YouTube Thumbnail', 1280, 720]
] satisfies FormatDefinition[]).map(format)

const videoFormats: BannerFormat[] = ([
  ['Facebook Square Video', 1200, 1200, 'Facebook'],
  ['Instagram Video Post', 1080, 1080, 'Instagram'],
  ['Video Story', 1080, 1920, 'Instagram'],
  ['Facebook FHD Video', 1920, 1080, 'Facebook'],
  ['HD Video', 1280, 720],
  ['Facebook Video Cover', 1250, 463, 'Facebook']
] satisfies FormatDefinition[]).map(format)

const digitalFormats: BannerFormat[] = ([
  ['Presentation', 1920, 1080],
  ['Logo', 800, 800],
  ['Slideshow', 960, 720],
  ['FHD Slideshow', 1920, 1080],
  ['HD Video', 1280, 720],
  ['eBook Cover', 1600, 2400]
] satisfies FormatDefinition[]).map(format)

const printFormats: BannerFormat[] = ([
  ['A4', 2480, 3508],
  ['A5', 1748, 2480],
  ['Business Card', 1050, 600]
] satisfies FormatDefinition[]).map(format)

function singles(category: BannerCatalogCategory, formats: BannerFormat[]): BannerCatalogPreset[] {
  return formats.map(item => ({
    id: `${category}-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: item.name,
    category,
    formats: [{ ...item }],
    icon: CATEGORY_ICONS[category],
    ...(category === 'print' ? { note: 'Pixel canvas only; not a print-ready CMYK or PDF document.' } : {}),
    ...(category === 'digital' && /presentation|slideshow/i.test(item.name)
      ? { note: 'Starts a single canvas; arrange content on the timeline.' }
      : {})
  }))
}

export const BANNER_CATALOG_PRESETS: BannerCatalogPreset[] = [
  {
    id: 'display-set', name: 'Display Design Set', category: 'display',
    formats: displayFormats.map(item => ({ ...item })), icon: 'i-lucide-panels-top-left',
    description: '23 display sizes in one editable design set.'
  },
  {
    id: 'performance-max-set', name: 'Performance Max Set', category: 'display',
    formats: performanceMaxFormats.map(item => ({ ...item })), icon: 'i-lucide-layout-grid',
    description: 'Square, landscape and portrait canvases for Performance Max.'
  },
  {
    id: 'social-campaign-set', name: 'Social Campaign Set', category: 'social',
    formats: socialFormats.map(item => ({ ...item })), icon: 'i-lucide-panels-top-left',
    description: 'Eight social formats for a coordinated campaign.',
    note: 'XeroFlow selection of common social sizes; platform requirements vary by placement.'
  },
  {
    id: 'social-posts-set', name: 'Social Posts Set', category: 'social',
    formats: [0, 1, 2, 5, 6].map(index => ({ ...socialFormats[index]! })), icon: 'i-lucide-layout-grid',
    description: 'Five formats for Instagram, Facebook, X and Pinterest posts.',
    note: 'XeroFlow selection of common social sizes; platform requirements vary by placement.'
  },
  {
    id: 'video-set', name: 'Video Design Set', category: 'video',
    formats: videoFormats.map(item => ({ ...item })), icon: 'i-lucide-clapperboard',
    description: 'Six video canvases with editable animation timelines.'
  },
  ...singles('display', displayFormats),
  ...singles('social', socialFormats),
  ...singles('print', printFormats),
  ...singles('digital', digitalFormats),
  ...singles('video', videoFormats)
]

/** Build saved native artboards; no catalog or template objects are reused by the editor. */
export function buildPresetCanvas(preset: BannerCatalogPreset, styleId?: string): Record<string, ArtboardState> {
  const style = styleId ? TEMPLATES.find(item => item.id === styleId) : undefined
  if (styleId && !style) throw new Error(`Unknown banner style: ${styleId}`)

  const canvas: Record<string, ArtboardState> = {}
  let layerId = 1
  for (const item of preset.formats) {
    if (canvas[item.key]) throw new Error(`Duplicate format in preset: ${item.key}`)
    const source: Partial<Layer>[] = style
      ? style.layers(item)
      : [{
          type: 'bg', name: 'Background', bgColor: '#ffffff', x: 0, y: 0,
          w: item.w, h: item.h, zIndex: 0, opacity: 1, locked: true,
          animIn: 'none', animInDur: 0, animOut: 'none', outDur: 0,
          startTime: 0, endTime: 6
        }]
    const layers = source.map((layer, index) => migrateLayer({
      ...structuredClone(layer),
      id: layerId++,
      linkId: `${preset.id}:${style?.id ?? 'blank'}:${index}`,
      // Factories have entrance timing but no explicit presence or cycle duration.
      // Hold through the initial six-second cycle instead of ending at legacy 2.5s defaults.
      endTime: layer.endTime ?? 6
    }))
    canvas[item.key] = {
      layers,
      bgColor: layers.find(layer => layer.type === 'bg')?.bgColor ?? '#ffffff',
      playback: { duration: Math.max(6, ...layers.map(layer => layer.endTime)), loopCount: 0 }
    }
  }
  return canvas
}
