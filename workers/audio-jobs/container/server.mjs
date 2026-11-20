// workers/audio-jobs/container/server.mjs
// Stateless FFmpeg-over-HTTP render service (runs in the RenderContainer).
// POST /render: body = master audio bytes, header x-audio-profile = ChannelProfile
// JSON. Runs 2-pass loudnorm (measure → linear normalize) + trim/fade, returns
// the variant bytes. No R2/DB creds here — the Worker owns persistence.
// V1.2b: /render-composite also accepts overlays (banner HTML → Chromium capture → composite).
import { serveCopyMeasurement } from './copyMeasurement.mjs'
import { readBaseFootageStartTime, serveMediaProbe } from './mediaProbe.mjs'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMeasurePassArgs, parseLoudnormJson, buildRenderPassArgs } from './render.mjs'
import { buildMasterRenderArgs } from './timelineFiltergraph.mjs'
import { buildCompositeRenderArgs } from './videoCompositeGraph.mjs'
import { captureCompositeOverlays } from './overlayCapture.mjs'
import { captureWithBrowser, createProgressStore, executionHeaders, isExecutionId, readCompositeBody, requestLifetime,
  runEncoder, streamCompositeFile } from './renderExecution.mjs'

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

const renderProgress = createProgressStore()

async function serveComposite(req, res) {
  let lifetime, record, dir
  try {
    const { id, timeoutMs } = executionHeaders(req.headers)
    record = renderProgress.begin(id)
    lifetime = requestLifetime(req, res, timeoutMs)
    const { signal } = lifetime
    res.setHeader('x-render-execution-id', id)
    const payload = JSON.parse((await readCompositeBody(req, signal)).toString('utf8'))
    lifetime.check()
    dir = mkdtempSync(join(tmpdir(), 'composite-'))
    const paths = payload.files.map((file, i) => {
      const path = join(dir, `in${i}`)
      writeFileSync(path, Buffer.from(file.b64, 'base64'))
      return path
    })
    lifetime.check()
    const baseStartSec = payload.plan.overlayInputs.some(overlay => overlay.baseFootage)
      ? await readBaseFootageStartTime(paths[0], signal)
      : undefined
    if (baseStartSec === null) {
      res.writeHead(422, { 'x-reelmotion-base': 'unsupported' })
      return res.end('Unsupported base footage profile')
    }
    const overlays = Array.isArray(payload.overlays) ? payload.overlays : []
    if (overlays.length) {
      record.update({ stage: 'capturing', framesDone: 0 })
      const puppeteer = (await import('puppeteer-core')).default
      await captureWithBrowser(puppeteer, signal, browser =>
        captureCompositeOverlays(browser, overlays, payload.plan.overlayInputs, dir, signal, record.update))
    }
    lifetime.check()
    const duration = payload.plan.durationSec
    const durationMs = Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : undefined
    const encoding = { stage: 'encoding', ...(durationMs === undefined ? {} : { durationMs }) }
    record.update(encoding)
    const outPath = join(dir, 'out.mp4')
    const args = ['-progress', 'pipe:3', ...buildCompositeRenderArgs(payload.plan, paths, outPath, baseStartSec)]
    const result = await runEncoder('ffmpeg', args, signal, ms => {
      record.update({ ...encoding, encodedTimeMs: Math.min(ms, durationMs ?? ms) })
    })
    if (result.code !== 0) {
      console.error('composite render ffmpeg failed', result.stderr.slice(-800))
      throw new Error('Composite encoding failed')
    }
    lifetime.check()
    record.update({ stage: 'streaming' })
    await streamCompositeFile(outPath, res, signal)
  } catch (cause) {
    const error = lifetime?.signal.aborted ? lifetime.signal.reason : cause
    if (!res.destroyed && !res.headersSent) {
      if (!req.complete) res.setHeader('connection', 'close')
      res.writeHead(error.statusCode ?? 500)
      res.end(error.statusCode ? error.message : 'composite render failed')
    } else if (!res.writableFinished && !res.destroyed) res.destroy()
  } finally {
    lifetime?.finish()
    record?.finish()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/measure-copy') return serveCopyMeasurement(req, res)
  if (req.method === 'POST' && req.url === '/probe') return serveMediaProbe(req,res)
  if (req.url === '/health') {
    res.writeHead(200); return res.end('ok')
  }

  if (req.method === 'POST' && req.url === '/render-timeline') {
    const dir = mkdtempSync(join(tmpdir(), 'tlrender-'))
    try {
      const payload = JSON.parse((await readBody(req)).toString('utf8')) // { plan, files: [{ b64 }] in input order }
      const paths = payload.files.map((f, i) => {
        const p = join(dir, `in${i}`)
        writeFileSync(p, Buffer.from(f.b64, 'base64'))
        return p
      })
      const outPath = join(dir, 'master.wav')
      const pass = await runFfmpeg(buildMasterRenderArgs(payload.plan, paths, outPath))
      if (pass.code !== 0) {
        console.error('timeline master ffmpeg failed', pass.stderr.slice(-800))
        res.writeHead(500); return res.end('timeline render failed')
      }
      const out = readFileSync(outPath)
      res.writeHead(200, { 'content-type': 'audio/wav' })
      return res.end(out)
    } catch (e) {
      console.error('render-timeline error', e)
      res.writeHead(500); return res.end('render-timeline error')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  if (req.method === 'POST' && req.url === '/render-composite') return serveComposite(req, res)
  if (req.method === 'GET' && req.url.startsWith('/render-progress/')) {
    const id = req.url.slice('/render-progress/'.length).toLowerCase()
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    if (!isExecutionId(id)) {
      res.writeHead(400)
      return res.end('null')
    }
    const state = renderProgress.get(id)
    res.writeHead(state ? 200 : 404)
    return res.end(JSON.stringify(state ?? null))
  }

  if (req.method === 'POST' && req.url === '/render-banner') {
    try {
      const { captureBannerMp4 } = await import('./bannerCapture.mjs')
      const body = JSON.parse((await readBody(req)).toString('utf8'))
      const mp4 = await captureBannerMp4(body)
      res.writeHead(200, { 'content-type': 'video/mp4' })
      return res.end(mp4)
    } catch (e) {
      console.error('render-banner error', e)
      res.writeHead(500); return res.end(e?.message ? String(e.message).slice(0, 2000) : 'render-banner error')
    }
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

// Container rollouts send SIGTERM. Stop accepting jobs while allowing accepted
// HTTP requests (and their FFmpeg/Chromium children) to complete and clean up.
// Cloudflare applies its own final termination deadline if a job never finishes.
let draining = false
function drain() {
  if (draining) return
  draining = true
  console.log('[render] draining accepted requests')
  server.close()
}
process.on('SIGTERM', drain)
process.on('SIGINT', drain)

server.listen(PORT, () => console.log(`[render] listening on ${PORT}`))
