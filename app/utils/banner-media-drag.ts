import type { BannerAsset } from '~/types/banner-studio'

export const BANNER_MEDIA_DRAG_TYPE = 'application/x-xeroflow-banner-media'
export type BannerMediaDragSource =
  | { kind: 'library', asset: BannerAsset }
  | { kind: 'motorstack', brandId: string, model?: string, colour?: string, assetId: string }

// Only media selected inside this editor can be dropped. Never trust a URL or
// asset object supplied by an external drag payload.
let activeDrag: { token: string, projectId: string | null, source: BannerMediaDragSource } | null = null

export function startBannerMediaDrag(event: DragEvent, source: BannerMediaDragSource, projectId?: string) {
  if (!event.dataTransfer) return
  const token = crypto.randomUUID()
  activeDrag = { token, projectId: projectId || null, source }
  event.dataTransfer.setData(BANNER_MEDIA_DRAG_TYPE, token)
  event.dataTransfer.effectAllowed = 'copy'
}

export function endBannerMediaDrag() { activeDrag = null }

export function takeBannerMediaDrag(token: string, projectId?: string): BannerMediaDragSource | null {
  const drag = activeDrag
  activeDrag = null
  return drag && drag.token === token && drag.projectId === (projectId || null) ? drag.source : null
}
