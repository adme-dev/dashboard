import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/** Extract one local MP4 soundtrack without changing the original video bytes. */
export async function extractVideoSoundtrack(bytes) {
  const directory = await mkdtemp(join(tmpdir(), 'thebrief-video-audio-'))
  const run = promisify(execFile)
  try {
    const input = join(directory, 'source.mp4'), output = join(directory, 'soundtrack.mp3')
    await writeFile(input, bytes, { mode: 0o600 })
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', input], { timeout: 15000, maxBuffer: 65536 })
    const media = JSON.parse(stdout), duration = Number(media.format?.duration)
    if (!Number.isFinite(duration) || duration <= 0 || duration > 300 || media.streams?.filter(stream => stream.codec_type === 'audio').length !== 1) throw new Error('Audible video requires exactly one bounded embedded soundtrack')
    await run('ffmpeg', ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe', '-i', input, '-map', '0:a:0', '-vn', '-t', String(duration), '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '192k', output], { timeout: 30000, maxBuffer: 65536 })
    const result = await readFile(output)
    if (!result.length || result.length > 10 * 1024 * 1024) throw new Error('Extracted video soundtrack exceeds the package limit')
    const verified = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', output], { timeout: 15000, maxBuffer: 65536 })
    const extractedDuration = Number(JSON.parse(verified.stdout).format?.duration)
    if (!Number.isFinite(extractedDuration) || Math.abs(extractedDuration - duration) > 0.1) throw new Error('Extracted video soundtrack duration differs from its source')
    return result
  } finally { await rm(directory, { recursive: true, force: true }) }
}

/** Reproduce the exported player's bounded gain fades; retain the source archive. */
export async function transformAudio(bytes, fade) {
  if (!fade) return bytes
  if (![fade.duration, fade.fadeIn, fade.fadeOut].every(Number.isFinite) || fade.duration <= 0 || fade.duration > 300 || fade.fadeIn < 0 || fade.fadeOut < 0 || fade.fadeIn + fade.fadeOut > fade.duration) throw new Error('Unsupported audio fade')
  const directory = await mkdtemp(join(tmpdir(), 'thebrief-audio-'))
  try {
    const input = join(directory, 'source.mp3'), output = join(directory, 'faded.mp3')
    await writeFile(input, bytes, { mode: 0o600 })
    const run = promisify(execFile)
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', input], { timeout: 15000, maxBuffer: 65536 })
    const duration = Number(JSON.parse(stdout).format?.duration)
    if (!Number.isFinite(duration) || duration < fade.duration - 0.05 || duration > fade.duration + 0.1) throw new Error('Exported audio duration differs from the authored clip trim')
    const filters = []
    if (fade.fadeIn) filters.push(`afade=t=in:st=0:d=${fade.fadeIn}`)
    if (fade.fadeOut) filters.push(`afade=t=out:st=${fade.duration - fade.fadeOut}:d=${fade.fadeOut}`)
    if (!filters.length) return bytes
    await run('ffmpeg', ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe', '-i', input, '-t', String(fade.duration), '-af', filters.join(','), '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '192k', output], { timeout: 30000, maxBuffer: 65536 })
    const result = await readFile(output)
    if (result.length > 21 * 1024 * 1024) throw new Error('Faded soundtrack exceeds the package limit')
    return result
  } finally { await rm(directory, { recursive: true, force: true }) }
}
