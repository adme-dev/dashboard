// workers/audio-jobs/container/server.mjs
// Stateless FFmpeg-over-HTTP render service (runs in the RenderContainer).
// POST /render: body = master audio bytes, header x-audio-profile = ChannelProfile
// JSON. Runs 2-pass loudnorm (measure → linear normalize) + trim/fade, returns
// the variant bytes. No R2/DB creds here — the Worker owns persistence.
// V1.2b: /render-composite also accepts overlays (banner HTML → Chromium capture → composite).
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMeasurePassArgs, parseLoudnormJson, buildRenderPassArgs } from './render.mjs'
import { buildMasterRenderArgs } from './timelineFiltergraph.mjs'
import { buildCompositeRenderArgs } from './videoCompositeGraph.mjs'
import { captureOverlay } from './overlayCapture.mjs'

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

  if (req.method === 'POST' && req.url === '/render-composite') {
    const dir = mkdtempSync(join(tmpdir(), 'composite-'))
    let browser = null
    try {
      // Body: { plan, files: [{ b64 }], overlays?: [{ clipId, html, framesPattern, fps, durationSec, width, height }] }
      const payload = JSON.parse((await readBody(req)).toString('utf8'))
      const paths = payload.files.map((f, i) => {
        const p = join(dir, `in${i}`)
        writeFileSync(p, Buffer.from(f.b64, 'base64'))
        return p
      })

      // V1.2b: capture overlay frames from banner HTML before ffmpeg composite.
      const overlays = Array.isArray(payload.overlays) ? payload.overlays : []
      if (overlays.length > 0) {
        // Drive the Chromium binary installed in this container image.
        const puppeteer = (await import('puppeteer-core')).default
        browser = await puppeteer.launch({
          executablePath: '/usr/bin/chromium',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        })
        for (const ov of overlays) {
          // framesPattern is e.g. 'ovl_clipId/%05d.png'; the dir part is the outDir.
          const framesDirName = ov.framesPattern.split('/')[0]
          const outDir = join(dir, framesDirName)
          mkdirSync(outDir, { recursive: true })
          await captureOverlay(browser, {
            html: ov.html,
            width: ov.width,
            height: ov.height,
            fps: ov.fps,
            durationSec: ov.durationSec,
            outDir,
          })
          // Replace the framesPattern in the plan's overlayInputs with an absolute path
          // so ffmpeg can find the frames. The plan already has the relative pattern;
          // buildCompositeRenderArgs uses plan.overlayInputs[].framesPattern.
          for (const planOv of payload.plan.overlayInputs) {
            if (planOv.clipId === ov.clipId) {
              planOv.framesPattern = join(outDir, 'ovl_%05d.png')
            }
          }
        }
        await browser.close()
        browser = null
      }

      const outPath = join(dir, 'out.mp4')
      const pass = await runFfmpeg(buildCompositeRenderArgs(payload.plan, paths, outPath))
      if (pass.code !== 0) {
        console.error('composite render ffmpeg failed', pass.stderr.slice(-800))
        res.writeHead(500); return res.end('composite render failed')
      }
      const out = readFileSync(outPath)
      res.writeHead(200, { 'content-type': 'video/mp4' })
      return res.end(out)
    } catch (e) {
      console.error('render-composite error', e)
      if (browser) { try { await browser.close() } catch {} }
      res.writeHead(500); return res.end('render-composite error')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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

server.listen(PORT, () => console.log(`[render] listening on ${PORT}`))
