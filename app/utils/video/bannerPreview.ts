import { parseBannerFontTags } from '~~/shared/banner/fonts'
import type { ExportCustomFont } from '../banner-html-builder'

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

interface OverlayWindow {
  __engagrFrame?: { seek: (time: number) => unknown }
  gsap?: { globalTimeline?: { getChildren: (nested: boolean) => Array<{ pause: () => void, seek: (time: number) => void }> } }
  document?: { querySelectorAll: (selector: string) => Iterable<{ muted: boolean, pause: () => void }> }
}
/** Modern runtime seeks video as well as GSAP. Audio plays on the native AV tracks. */
export async function seekOverlayPreview(window: OverlayWindow | null | undefined, time: number): Promise<void> {
  if (!window) return
  for (const audio of window.document?.querySelectorAll('audio') ?? []) {
    audio.muted = true
    audio.pause()
  }
  if (window.__engagrFrame?.seek) await window.__engagrFrame.seek(Math.max(0, time))
  else {
    const timeline = window.gsap?.globalTimeline?.getChildren(false)?.[0]
    timeline?.pause()
    timeline?.seek(Math.max(0, time))
  }
}
