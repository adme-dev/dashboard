import type { Layer, BannerPlayback } from '~~/app/types/banner-studio'
import type { TimelineState } from './timelineSchema'
import type { ReelmotionBaseFootage } from '~~/shared/reelmotionBaseFootage'
import { queryOne } from '~~/server/utils/db'
import { getFileMetadata } from '~~/server/utils/storage'

type SplitInput = {
  format: string
  width: number
  height: number
  duration: number
  playback?: BannerPlayback
  layers: Layer[]
  timeline: TimelineState
  clip: { id: string, gsap_project_id: string, gsap_format_key?: string, timeline_start_sec: number, duration_sec: number, placement?: unknown, opacity?: number }
}

const videoKeys = new Set(['id', 'name', 'type', 'src', 'srcType', 'x', 'y', 'w', 'h', 'zIndex', 'opacity', 'startTime', 'endTime', 'fit', 'focalX', 'focalY', 'rotation', 'flipX', 'flipY', 'hidden', 'locked', 'slideId', 'linkId', 'timelineGroup', 'transformOrigin', 'animIn', 'animOut', 'animInDur', 'outDur', 'keyframes', 'mediaStart', 'mediaEnd', 'mediaLoop'])
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Resolve the view independently of the optimization so unsupported motion still
 * keeps the entire pinned artboard when Chromium renders the original HTML. */
export function portraitArtworkView({ format, width, height, clip, timeline }: Pick<SplitInput, 'format' | 'width' | 'height' | 'clip' | 'timeline'>): 'native' | 'contained' | null {
  if (width !== 1080 || height !== 1920 || timeline.width !== width || timeline.height !== height
    || clip.timeline_start_sec !== 0 || clip.duration_sec !== timeline.duration_sec || clip.placement != null || (clip.opacity ?? 1) !== 1) return null
  const visuals = timeline.tracks.filter(track => ['video', 'overlay', 'caption'].includes(track.kind) && track.clips.length)
  if (visuals.length !== 1 || visuals[0]!.kind !== 'overlay' || visuals[0]!.hidden || visuals[0]!.muted
    || visuals[0]!.clips.length !== 1 || visuals[0]!.clips[0]!.id !== clip.id) return null
  if (format === 'reels_9x16') return 'native'
  if (clip.gsap_format_key && (format === 'square_1x1' || format === 'youtube_16x9')) return 'contained'
  return null
}

/** Conservative eligibility: unsupported artwork keeps the complete HTML path. */
export function selectReelmotionBaseFootage(input: SplitInput): { video: Layer, graphics: Layer[], zoom: ReelmotionBaseFootage['zoom'] } | null {
  const { duration, layers, clip, timeline } = input
  if (!portraitArtworkView(input) || !finite(duration) || duration <= 0 || duration > 90
    || input.playback?.duration !== duration || input.playback.loopCount !== 0
    || timeline.duration_sec !== duration || !/^[A-Za-z0-9_-]+$/.test(clip.id)) return null
  if (layers.some(layer => layer.type !== 'audio' && !layer.hidden && !finite(layer.zIndex))) return null
  if (new Set(layers.map(layer => layer.id)).size !== layers.length || layers.some(layer => layer.isMask || layer.slideTransitionFor)) return null
  const videos = layers.filter(layer => layer.type === 'video' || (layer.type === 'bg' && layer.srcType === 'video'))
  if (videos.length !== 1) return null
  const video = videos[0]!
  if (video.type !== 'video' || !video.src || video.hidden || video.opacity !== 1 || video.startTime !== 0 || video.endTime !== duration
    || video.x !== 0 || video.y !== 0 || video.w !== 1080 || video.h !== 1920 || !finite(video.zIndex)
    || video.fit !== 'cover' || (video.focalX ?? 50) !== 50 || (video.focalY ?? 50) !== 50 || video.rotation || video.flipX || video.flipY
    || video.animIn !== 'none' || video.animOut !== 'none' || video.mediaLoop || (video.mediaStart ?? 0) !== 0
    || (video.mediaEnd !== undefined && (!finite(video.mediaEnd) || video.mediaEnd < duration))
    || (video.transformOrigin && (video.transformOrigin.x !== 540 || video.transformOrigin.y !== 960))
    || Object.keys(video).some(key => !videoKeys.has(key))) return null
  // Blend/backdrop dependence on the removed video cannot be baked into alpha PNGs.
  if (layers.some(layer => (layer.mixBlendMode && layer.mixBlendMode !== 'normal'))) return null
  const below = layers.filter(layer => layer.type !== 'audio' && layer.id !== video.id && !layer.hidden && layer.zIndex <= video.zIndex)
  if (below.some(layer => layer.type !== 'bg' || layer.zIndex === video.zIndex)) return null
  const tracks = video.keyframes ?? {}
  if (Object.keys(tracks).some(key => !['opacity', 'scaleX', 'scaleY'].includes(key))) return null
  const xs = [...(tracks.scaleX ?? [])].sort((a, b) => a.time - b.time)
  const ys = [...(tracks.scaleY ?? [])].sort((a, b) => a.time - b.time)
  if (xs.length === 1 || xs.length !== ys.length || xs.length > 64 || (xs.length && xs[0]!.time !== 0)) return null
  if (xs.some((point, i) => !finite(point.time) || !finite(point.value) || point.time < 0 || point.time > duration
    || point.value < 1 || point.value > 2 || (i > 0 && point.time <= xs[i - 1]!.time)
    || ys[i]!.time !== point.time || ys[i]!.value !== point.value
    || (i < xs.length - 1 && (!['linear', 'none'].includes(point.easing ?? '') || !['linear', 'none'].includes(ys[i]!.easing ?? ''))))) return null
  const opacity = [...(tracks.opacity ?? [])].sort((a, b) => a.time - b.time)
  // A keyframed layer without a zero-time opacity1 begins hidden in the HTML builder.
  if (opacity.length < 2 || opacity[0]!.time !== 0
    || opacity.some(point => !finite(point.time) || point.time < 0 || point.time > duration || point.value !== 1)) return null
  const graphics = layers.filter(layer => layer.type !== 'audio' && layer.zIndex > video.zIndex)
  return { video, graphics, zoom: xs.length ? xs.map(point => ({ timeSec: point.time, scale: point.value })) : [{ timeSec: 0, scale: 1 }] }
}

type ManagedFootage = { r2Key: string, clientId: string | null, mimeType: string }
type ResolveInput = { clientId: string, bannerId: string, src: string, graphicsHtmlKey: string, zoom: ReelmotionBaseFootage['zoom'] }
type Dependencies = { query: (sql: string, args: string[]) => Promise<ManagedFootage | null>, metadata: (key: string) => Promise<{ size: number, etag: string | null, contentType: string } | null> }

/** Resolve only an authorized managed source; no arbitrary source fetches. */
export async function resolveReelmotionBaseFootage(input: ResolveInput, deps?: Dependencies): Promise<ReelmotionBaseFootage | null> {
  if (!input.clientId) return null
  const query = deps?.query ?? queryOne<ManagedFootage>
  const source = await query(`SELECT a.r2_key AS "r2Key", a.client_id AS "clientId", a.mime_type AS "mimeType"
    FROM banner_assets a JOIN banner_projects b ON b.id = $1 AND b.client_id = $2
    AND 'source:reelmotion' = ANY(b.tags)
    WHERE a.client_id = $2 AND a.url = $3 AND a.mime_type = 'video/mp4'`, [input.bannerId, input.clientId, input.src])
  if (!source || source.clientId !== input.clientId || source.mimeType !== 'video/mp4'
    || !/^banner-assets\/[A-Za-z0-9_./-]+\.mp4$/.test(source.r2Key) || source.r2Key.split('/').some(part => !part || part === '.' || part === '..')) return null
  const metadata = await (deps?.metadata ?? getFileMetadata)(source.r2Key)
  const etag = metadata?.etag?.replace(/^"|"$/g, '')
  if (!metadata || !etag || !/^[A-Za-z0-9-]{1,128}$/.test(etag) || !Number.isSafeInteger(metadata.size)
    || metadata.size <= 0 || metadata.size > 16 * 1024 * 1024 || metadata.contentType !== 'video/mp4') return null
  return { version: 1, graphicsHtmlKey: input.graphicsHtmlKey, source: { r2Key: source.r2Key, etag, size: metadata.size }, zoom: input.zoom }
}
