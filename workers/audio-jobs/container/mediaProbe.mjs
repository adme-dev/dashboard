import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MAX_BYTES = 64 * 1024 * 1024
const INPUT_FORMATS
  = 'mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,mp3,wav,flac,ogg,aac,image2,png_pipe,jpeg_pipe,webp_pipe,gif,bmp_pipe,tiff_pipe'
function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    let failed = false
    const fail = () => {
      failed = true
      proc.kill('SIGKILL')
    }
    const timer = setTimeout(fail, timeoutMs)
    proc.stdout.on('data', (chunk) => {
      out += chunk
      if (out.length > 1024 * 1024) fail()
    })
    proc.stderr.on('data', (chunk) => {
      err += chunk
      if (err.length > 65536) fail()
    })
    proc.on('error', () => {
      clearTimeout(timer)
      reject(new Error('Media decoder unavailable'))
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (failed || code !== 0 || err.trim())
        reject(new Error('Media decode failed'))
      else resolve(out)
    })
  })
}
/** Local bytes only. Restricted demuxers exclude playlists; network protocols are disabled. */
export async function probeMediaBytes(bytes, { timeoutMs = 20_000 } = {}) {
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw new Error('Invalid probe size')
  const dir = await mkdtemp(join(tmpdir(), 'media-probe-'))
  const path = join(dir, 'source')
  const deadline = Date.now() + Math.min(20_000, timeoutMs)
  const remaining = () => {
    const n = deadline - Date.now()
    if (n <= 0) throw new Error('Probe timeout')
    return n
  }
  try {
    await writeFile(path, bytes)
    // file protocol can open only the generated input; format allowlist excludes playlists/concat.
    const common = [
      '-v',
      'error',
      '-max_alloc',
      '67108864',
      '-protocol_whitelist',
      'file',
      '-format_whitelist',
      INPUT_FORMATS,
      '-threads',
      '1'
    ]
    const data = JSON.parse(
      await run(
        'ffprobe',
        [...common, '-show_streams', '-show_format', '-of', 'json', path],
        remaining()
      )
    )
    const videos = (data.streams ?? []).filter(
      s => s.codec_type === 'video' && !s.disposition?.attached_pic
    )
    const audio = (data.streams ?? []).filter(s => s.codec_type === 'audio')
    if (
      videos.length > 1
      || audio.length > 1
      || (!videos.length && !audio.length)
    )
      throw new Error('Unsupported media streams')
    const visual = videos[0]
    if (
      visual
      && (![visual.width, visual.height].every(
        n => Number.isInteger(n) && n > 0 && n <= 8192
      )
      || visual.width * visual.height > 33_554_432)
    )
      throw new Error('Unsupported media dimensions')
    const image
      = !!visual
        && /^(png_pipe|jpeg_pipe|webp_pipe|bmp_pipe|tiff_pipe|image2)$/.test(
          data.format?.format_name ?? ''
        )
    const progress = await run(
      'ffmpeg',
      [
        ...common,
        '-nostdin',
        '-xerror',
        '-err_detect',
        'explode',
        '-i',
        path,
        '-map',
        '0:v:0?',
        '-map',
        '0:a:0?',
        '-sn',
        '-dn',
        '-progress',
        'pipe:1',
        '-nostats',
        '-f',
        'null',
        '-'
      ],
      remaining()
    )
    const times = [...progress.matchAll(/^out_time_us=(\d+)$/gm)].map(
      m => Number(m[1]) / 1_000_000
    )
    const durationSeconds = Math.max(0, ...times)
    if (
      !image
      && (!Number.isFinite(durationSeconds)
        || durationSeconds <= 0
        || durationSeconds > 3600)
    )
      throw new Error('Invalid decoded duration')
    return {
      kind: image ? 'image' : visual ? 'video' : 'audio',
      durationSeconds: image ? null : durationSeconds,
      ...(visual ? { width: visual.width, height: visual.height } : {})
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
let active = false
export async function serveMediaProbe(req, res) {
  if (active) {
    res.writeHead(429)
    res.end('Probe busy')
    return
  }
  active = true
  const timer = setTimeout(() => req.destroy(), 15_000)
  try {
    const expected = Number(req.headers['x-probe-size'])
    if (
      !Number.isSafeInteger(expected)
      || expected <= 0
      || expected > MAX_BYTES
    )
      throw new Error('Invalid size')
    let size = 0
    const chunks = []
    for await (const chunk of req) {
      size += chunk.length
      if (size > expected) throw new Error('Oversized body')
      chunks.push(chunk)
    }
    clearTimeout(timer)
    if (size !== expected) throw new Error('Truncated body')
    const result = await probeMediaBytes(Buffer.concat(chunks))
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(result))
  } catch {
    res.writeHead(422)
    res.end('Media could not be measured')
  } finally {
    clearTimeout(timer)
    active = false
  }
}
