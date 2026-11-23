import { parseBannerFontTags } from '~~/shared/banner/fonts'
import type { ExportCustomFont } from '../banner-html-builder'
import type { Layer } from '~/types/banner-studio'
import { createBannerVideoTransport } from '../bannerVideoPlayback'

/** Only interactive editor HTML gets this adapter. Export/capture HTML is unchanged. */
export function withInteractiveOverlayPlayback(html: string, layers: Layer[]): string {
  const clocks = layers.filter(layer => layer.type === 'video' || (layer.type === 'bg' && layer.srcType === 'video'))
    .map(layer => ({ id: layer.id, startTime: layer.startTime || 0, endTime: layer.endTime || (layer.startTime || 0) + 3, mediaStart: layer.mediaStart, mediaEnd: layer.mediaEnd, mediaLoop: layer.mediaLoop, hidden: layer.hidden }))
  return html.replace('</body>', `<script>window.__engagrPreviewVideoClocks = ${JSON.stringify(clocks).replace(/</g, '\\u003C')};</script></body>`)
}

export function overlayPreviewFonts(
  layers: Array<{ fontAssetId?: string }>,
  fonts: Array<{ id: string, name: string, url: string, tags: string[], clientId: string | null }>,
  clientId: string | null
): ExportCustomFont[] {
  return [...new Set(layers.map(layer => layer.fontAssetId?.toLowerCase()).filter((id): id is string => !!id))].map((id) => {
    const font = fonts.find(font => font.id.toLowerCase() === id && (font.clientId === null || font.clientId === clientId))
    if (!font) throw new Error('An artwork font is unavailable. Reopen the banner draft and check its fonts.')
    return { id: font.id, family: font.name, url: font.url, ...parseBannerFontTags(font.tags) }
  })
}

export interface OverlayWindow {
  __engagrPreviewVideoClocks?: Array<Pick<Layer, 'id' | 'startTime' | 'endTime' | 'mediaStart' | 'mediaEnd' | 'mediaLoop' | 'hidden'>>
  __engagrTimeline?: { pause: () => void, totalTime: (time: number, suppressEvents: boolean) => void }
  __engagrUpdateMasks?: () => void
  __engagrFrame?: { seek: (time: number) => unknown }
  gsap?: { globalTimeline?: { getChildren: (nested: boolean) => Array<{ pause: () => void, seek: (time: number) => void }> } }
  document?: { querySelectorAll: (selector: string) => Iterable<{ muted: boolean, pause: () => void }>, querySelector?: (selector: string) => HTMLVideoElement | null }
}
const previewTransports = new WeakMap<OverlayWindow, ReturnType<typeof createBannerVideoTransport>>()

/** Interactive media decodes continuously; capture/legacy artwork retains its seek fallback. */
export async function seekOverlayPreview(window: OverlayWindow | null | undefined, time: number, playing = false): Promise<void> {
  if (!window) return
  for (const audio of window.document?.querySelectorAll('audio') ?? []) {
    audio.muted = true
    audio.pause()
  }
  if (window.__engagrPreviewVideoClocks) {
    let transport = previewTransports.get(window)
    if (!transport) {
      transport = createBannerVideoTransport()
      previewTransports.set(window, transport)
    }
    window.__engagrTimeline?.pause()
    window.__engagrTimeline?.totalTime(Math.max(0, time), false)
    window.__engagrUpdateMasks?.()
    for (const clock of window.__engagrPreviewVideoClocks) {
      const video = window.document?.querySelector?.(`[data-id="${clock.id}"] video`)
      if (video) transport.sync(video, time, playing, clock)
    }
  } else if (window.__engagrFrame?.seek) await window.__engagrFrame.seek(Math.max(0, time))
  else {
    const timeline = window.gsap?.globalTimeline?.getChildren(false)?.[0]
    timeline?.pause()
    timeline?.seek(Math.max(0, time))
  }
}

export function pauseOverlayPreview(window: OverlayWindow | null | undefined) {
  if (window) previewTransports.get(window)?.pause()
}

export function disposeOverlayPreview(window: OverlayWindow | null | undefined) {
  if (!window) return
  previewTransports.get(window)?.dispose()
  previewTransports.delete(window)
}
