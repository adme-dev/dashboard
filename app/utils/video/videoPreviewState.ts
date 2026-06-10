import { activeVisualClipAt } from '~~/app/utils/video/composite'

export type VideoPreviewMediaStatus = 'loading' | 'ready' | 'error'

export type VideoPreviewState =
  | { kind: 'empty' }
  | { kind: 'missing-source'; clipId: string; r2Key: string }
  | { kind: 'loading'; clipId: string; r2Key: string }
  | { kind: 'ready'; clipId: string; r2Key: string }
  | { kind: 'error'; clipId: string; r2Key: string }

export function resolveVideoPreviewState(input: {
  clips: any[]
  currentTime: number
  sources: Record<string, string>
  mediaStatus: Record<string, VideoPreviewMediaStatus>
}): VideoPreviewState {
  const active = activeVisualClipAt(input.clips, input.currentTime) as any
  if (!active) return { kind: 'empty' }

  const r2Key = String(active.r2_key ?? '')
  if (!r2Key || !input.sources[r2Key]) {
    return { kind: 'missing-source', clipId: String(active.id), r2Key }
  }

  const status = input.mediaStatus[String(active.id)] ?? 'loading'
  return { kind: status, clipId: String(active.id), r2Key }
}

export function isSamePreviewSourceUrl(currentUrl: string, nextUrl: string, baseUrl = 'https://app.xeroflow.io/'): boolean {
  if (!currentUrl || !nextUrl) return false
  try {
    return new URL(currentUrl, baseUrl).href === new URL(nextUrl, baseUrl).href
  } catch {
    return currentUrl === nextUrl
  }
}
