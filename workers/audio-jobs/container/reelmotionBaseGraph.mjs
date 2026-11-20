// Pure FFmpeg graph fragment shared by the server, Worker and render image.
export function buildReelmotionBase(state, profile, duration, overlays) {
  if (!overlays.some(overlay => overlay.baseFootage)) return null
  const [overlay] = overlays
  const activeVisuals = state.tracks.filter(track => !track.muted && ['video', 'overlay', 'caption'].includes(track.kind))
    .flatMap(track => track.clips)
  const clip = activeVisuals[0]
  if (overlays.length !== 1 || activeVisuals.length !== 1 || clip?.type !== 'overlay'
    || clip.id !== overlay.clipId || clip.placement != null || (clip.opacity ?? 1) !== 1
    || clip.timeline_start_sec !== 0 || clip.duration_sec !== duration
    || overlay.timeline_start_sec !== 0 || overlay.duration_sec !== duration
    || profile.format !== 'reels_9x16' || profile.width !== 1080 || profile.height !== 1920 || profile.fps !== 30
    || !Number.isFinite(duration) || duration <= 0 || duration > 90) {
    throw new Error('Unsupported ReelMotion base footage composition')
  }

  const { r2Key, zoom } = overlay.baseFootage
  if (!Array.isArray(zoom) || !zoom.length || zoom.length > 64 || zoom[0]?.timeSec !== 0) {
    throw new Error('Invalid ReelMotion zoom curve')
  }
  let expression = ''
  for (const [index, point] of zoom.entries()) {
    const previous = zoom[index - 1]
    if (!point || !Number.isFinite(point.timeSec) || point.timeSec < 0 || point.timeSec > duration
      || !Number.isFinite(point.scale) || point.scale < 1 || point.scale > 2
      || (previous && previous.timeSec >= point.timeSec)) throw new Error('Invalid ReelMotion zoom point')
    if (!previous) expression = String(point.scale)
    else {
      // Summing clamped linear ramps also preserves sub-frame cuts between zooms.
      const span = point.timeSec - previous.timeSec
      expression += `+(${point.scale - previous.scale})*clip((on/${profile.fps}-${previous.timeSec})/${span},0,1)`
    }
  }
  const { width, height, fps } = profile
  const filter = [
    `[0:v]fps=fps=${fps}:start_time=0:round=up`,
    `scale=${width}:${height}:force_original_aspect_ratio=increase`, `crop=${width}:${height}`,
    `tpad=stop_mode=clone:stop_duration=${duration}`, `trim=duration=${duration}`,
    `zoompan=z='${expression}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${width}x${height}:fps=${fps}`,
    'setsar=1[vb0]'
  ].join(',')
  return { input: { clipId: overlay.clipId, r2_key: r2Key }, filter }
}
