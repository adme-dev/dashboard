// Versioned, data-only soundtrack contract shared by HTML export and the render container.
export const MAX_AUDIO_TRACKS = 32
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024
export function isInlineBannerAudio(src) {
  return typeof src === 'string' && src.length <= Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 80 && /^data:audio\/(?:mpeg|mp3|wav|wave|x-wav|ogg|aac|mp4|flac);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)
}
export function validateBannerAudioTracks(tracks) {
  if (!Array.isArray(tracks) || tracks.length > MAX_AUDIO_TRACKS) throw new Error('Invalid banner audio track count')
  return tracks.map(t => {
    if (!t || typeof t.src !== 'string') throw new Error('Invalid banner audio source')
    const url = new URL(t.src)
    if (!isInlineBannerAudio(t.src) && (t.src.length > 8192 || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))) throw new Error('Banner audio requires an HTTPS asset URL')
    if (![t.start, t.end, t.volume].every(Number.isFinite) || t.start < 0 || t.end <= t.start || t.end > 300 || t.volume < 0 || t.volume > 1 || typeof t.loop !== 'boolean') throw new Error('Invalid banner audio timing or volume')
    return { src: t.src, start: t.start, end: t.end, volume: t.volume, loop: t.loop }
  })
}
export function buildBannerAudioManifest(layers) {
  const tracks = layers.filter(l => l.type === 'audio' && l.src).map(l => ({
    src: l.src, start: l.startTime ?? 0, end: l.endTime ?? ((l.startTime ?? 0) + 3),
    volume: l.muted || l.hidden ? 0 : (l.volume ?? 1), loop: !!l.loopAudio,
  }))
  return `<script type="application/json" id="banner-audio">${JSON.stringify({ version: 1, tracks }).replace(/</g, '\\u003c')}</script>`
}
export function readBannerAudioManifest(html) {
  const matches = [...html.matchAll(/<script type="application\/json" id="banner-audio">([\s\S]*?)<\/script>/g)]
  if (!matches.length) {
    if (/<audio\b/i.test(html)) throw new Error('Regenerate this export to include its audio timing')
    return []
  }
  if (matches.length !== 1) throw new Error('Duplicate banner audio manifest')
  const manifest = JSON.parse(matches[0][1])
  if (manifest.version !== 1) throw new Error('Unsupported banner audio version')
  const tracks = validateBannerAudioTracks(manifest.tracks)
  if ([...html.matchAll(/<audio\b/gi)].length !== tracks.length) throw new Error('Banner audio manifest does not match the artwork')
  return tracks
}

// Input 0 is the captured video. Every audio input is a bounded local file.
export function buildBannerAudioMixArgs(tracks, paths, duration) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 30 || paths.length !== tracks.length) throw new Error('Invalid banner audio mix duration or inputs')
  const inputs = [], filters = [], labels = []
  tracks.forEach((t, i) => {
    if (t.loop) inputs.push('-stream_loop', '-1')
    inputs.push('-t', String(Math.min(t.end, duration) - t.start), '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mp3,wav,ogg,mov,flac,aac', '-i', paths[i])
    const length = Math.max(0, Math.min(t.end, duration) - t.start)
    if (!length) throw new Error('Audio track is outside the render duration')
    const label = `ba${i}`
    filters.push(`[${i + 1}:a:0]atrim=duration=${length},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${t.volume},adelay=${Math.round(t.start * 48000)}S:all=1[${label}]`)
    labels.push(`[${label}]`)
  })
  if (!tracks.length) return { inputs, output: ['-map', '0:v:0', '-an'] }
  filters.push(`anullsrc=r=48000:cl=stereo:d=${duration}[silence]`)
  filters.push(`[silence]${labels.join('')}amix=inputs=${tracks.length + 1}:duration=first:dropout_transition=0:normalize=0[bannerAudio]`)
  return { inputs, output: ['-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[bannerAudio]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] }
}
