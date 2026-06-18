export const VIDEO_RENDER_FORMATS = [
  {
    id: 'reels_9x16',
    label: 'Reels / TikTok',
    detail: '9:16 vertical',
    icon: 'i-lucide-smartphone',
  },
  {
    id: 'square_1x1',
    label: 'Square',
    detail: '1:1 feed',
    icon: 'i-lucide-square',
  },
  {
    id: 'youtube_16x9',
    label: 'YouTube',
    detail: '16:9 landscape',
    icon: 'i-lucide-monitor-play',
  },
] as const

export type VideoRenderFormatId = typeof VIDEO_RENDER_FORMATS[number]['id']

const VIDEO_RENDER_FORMAT_IDS = new Set<string>(VIDEO_RENDER_FORMATS.map(format => format.id))

export const DEFAULT_VIDEO_RENDER_FORMATS: VideoRenderFormatId[] = VIDEO_RENDER_FORMATS.map(format => format.id)

export function normalizeVideoRenderFormats(formats: readonly string[] | null | undefined): VideoRenderFormatId[] {
  const seen = new Set<VideoRenderFormatId>()
  for (const format of formats ?? []) {
    if (VIDEO_RENDER_FORMAT_IDS.has(format)) seen.add(format as VideoRenderFormatId)
  }
  return seen.size ? [...seen] : [...DEFAULT_VIDEO_RENDER_FORMATS]
}
