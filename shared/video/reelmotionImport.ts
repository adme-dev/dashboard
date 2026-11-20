import { TimelineStateSchema, validateTimeline, type TimelineState } from '~~/server/utils/audio/timelineSchema'

export interface SavedReel {
  id: string
  clientId: string | null
  canvasData: Record<string, { playback?: { duration: number, loopCount?: number }, layers: Array<{ type: string, src?: string, startTime?: number, endTime?: number, volume?: number, muted?: boolean, hidden?: boolean, loopAudio?: boolean, name?: string }> }>
}
export interface ManagedAudio { id: string, url: string, r2Key: string, clientId: string | null, mimeType: string }

/** Use only read-back artwork and scoped managed assets; never package-supplied R2 keys. */
export function reelmotionVideoTimeline(project: SavedReel, assets: ManagedAudio[]): TimelineState {
  const board = project.canvasData.custom_1080x1920
  const duration = board?.playback?.duration
  if (!project.clientId || Object.keys(project.canvasData).length !== 1 || !Number.isFinite(duration) || !duration || duration <= 0 || duration > 90 || board?.playback?.loopCount) throw new Error('Invalid ReelMotion client or duration')
  const audio = board.layers.filter(layer => layer.type === 'audio' && !layer.muted && !layer.hidden && (layer.volume ?? 1) > 0)
  if (!audio.length) throw new Error('ReelMotion requires managed presenter audio')
  const state = TimelineStateSchema.parse({
    schema_version: 2, media_type: 'av', width: 1080, height: 1920, fps: 30, sample_rate: 48000, duration_sec: duration,
    tracks: [
      { id: 'reelmotion-artwork', name: 'ReelMotion editable artwork', kind: 'overlay', clips: [{ type: 'overlay', id: 'reelmotion-overlay', gsap_project_id: project.id, gsap_format_key: 'custom_1080x1920', timeline_start_sec: 0, duration_sec: duration }] },
      ...audio.map((layer, index) => {
        const asset = assets.find(asset => asset.url === layer.src && asset.clientId === project.clientId && asset.mimeType.startsWith('audio/') && asset.r2Key.startsWith('banner-assets/') && !asset.r2Key.split('/').includes('..'))
        if (!asset || layer.loopAudio) throw new Error('ReelMotion audio must be an imported, non-looping asset for this client')
        const start = layer.startTime ?? 0, end = layer.endTime ?? duration
        if (start < 0 || end <= start || end > duration) throw new Error('Invalid ReelMotion audio timing')
        return { id: `reelmotion-audio-${index}`, name: layer.name || (index === 0 ? 'Presenter' : 'Music'), kind: index === 0 ? 'voiceover' : 'music', clips: [{ type: 'audio', id: `reelmotion-audio-clip-${index}`, asset_id: null, r2_key: asset.r2Key, timeline_start_sec: start, source_in_sec: 0, source_out_sec: end - start, gain_db: 20 * Math.log10(layer.volume ?? 1) }] }
      })
    ]
  })
  const checked = validateTimeline(state)
  if (checked.ok === false) throw new Error(checked.errors.join('; '))
  return state
}
