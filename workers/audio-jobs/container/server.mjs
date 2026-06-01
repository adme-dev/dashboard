// workers/audio-jobs/container/server.mjs
// Stateless FFmpeg-over-HTTP render service (runs in the RenderContainer).
// POST /render: body = master audio bytes, header x-audio-profile = ChannelProfile
// JSON. Runs 2-pass loudnorm (measure → linear normalize) + trim/fade, returns
// the variant bytes. No R2/DB creds here — the Worker owns persistence.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMeasurePassArgs, parseLoudnormJson, buildRenderPassArgs } from './render.mjs'

const PORT = process.env.PORT || 8080

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => resolve({ code, stderr }))
  })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200); return res.end('ok')
  }
  if (req.method !== 'POST' || req.url !== '/render') {
    res.writeHead(404); return res.end('not found')
  }

  let profile
  try {
    profile = JSON.parse(req.headers['x-audio-profile'] || '')
  } catch {
    res.writeHead(400); return res.end('invalid x-audio-profile')
  }

  const dir = mkdtempSync(join(tmpdir(), 'render-'))
  const inPath = join(dir, 'in')
  const ext = profile.format === 'wav' ? 'wav' : 'mp3'
  const outPath = join(dir, `out.${ext}`)
  try {
    writeFileSync(inPath, await readBody(req))

    // Pass 1 — measure (loudnorm prints JSON stats to stderr).
    const measurePass = await runFfmpeg(buildMeasurePassArgs(inPath, profile))
    const measured = parseLoudnormJson(measurePass.stderr)

    // Pass 2 — linear normalize with the measured values (+ trim/fade), encode.
    const renderPass = await runFfmpeg(buildRenderPassArgs(inPath, outPath, profile, measured))
    if (renderPass.code !== 0) {
      console.error('ffmpeg render failed', renderPass.stderr.slice(-800))
      res.writeHead(500); return res.end('ffmpeg render failed')
    }

    const out = readFileSync(outPath)
    res.writeHead(200, { 'content-type': ext === 'wav' ? 'audio/wav' : 'audio/mpeg' })
    res.end(out)
  } catch (e) {
    console.error('render error', e)
    res.writeHead(500); res.end('render error')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

server.listen(PORT, () => console.log(`[render] listening on ${PORT}`))
