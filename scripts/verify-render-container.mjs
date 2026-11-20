// Run inside the built image, without mounting application source over /app:
// docker run --rm --platform linux/amd64 --network none --entrypoint node \
//   -v "$PWD/scripts/verify-render-container.mjs:/verification.mjs:ro" IMAGE /verification.mjs
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { request } from 'node:http'
import { once } from 'node:events'

const dir = mkdtempSync(join(tmpdir(), 'render-verification-'))
const origin = 'http://127.0.0.1:8080'
const drainSignal = process.env.VERIFY_DRAIN_SIGNAL || 'SIGTERM'
assert.ok(['SIGTERM', 'SIGINT'].includes(drainSignal))
let logs = ''
const server = spawn(process.execPath, ['/app/server.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] })
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (b) => {
    logs = (logs + b).slice(-16000)
  })
}
const ffmpeg = args => execFileSync('ffmpeg', ['-v', 'error', '-threads', '1', '-filter_complex_threads', '1', '-y', ...args], { timeout: 60000 })
const post = (path, body, headers = {}) => fetch(origin + path, {
  method: 'POST', body: Buffer.isBuffer(body) ? body : JSON.stringify(body),
  headers: { 'content-type': 'application/json', ...headers }, signal: AbortSignal.timeout(120000)
})
async function output(response, name, kind) {
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.equal(response.status, 200, `${name}: ${bytes.toString().slice(0, 500)}\n${logs}`)
  assert.ok(response.headers.get('content-type')?.startsWith(kind), name)
  const path = join(dir, name)
  writeFileSync(path, bytes)
  const facts = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { timeout: 30000 }))
  ffmpeg(['-i', path, '-f', 'null', '-']) // Decode the entire result, not just its headers.
  return { facts, path }
}
try {
  let ready = false
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${logs}`)
    ready = await fetch(origin + '/health').then(r => r.ok).catch(() => false)
    if (ready) break
    await delay(100)
  }
  assert.ok(ready, `Server readiness: ${logs}`)
  console.log(execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0])
  const tonePath = join(dir, 'tone.wav')
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', tonePath])
  const tone = readFileSync(tonePath)
  const probe = await post('/probe', tone, { 'x-probe-size': String(tone.length) })
  assert.equal(probe.status, 200)
  assert.deepEqual(await probe.json(), { kind: 'audio', durationSeconds: 1 })
  for (const bad of ['not media', '#EXTM3U\n#EXTINF:1\nhttp://127.0.0.1/private']) {
    assert.equal((await post('/probe', Buffer.from(bad), { 'x-probe-size': String(Buffer.byteLength(bad)) })).status, 422)
  }
  const normalized = await output(await post('/render', tone, {
    'x-audio-profile': JSON.stringify({ format: 'wav', lufs: -16, truePeak: -1, lra: 11, maxDurationSec: 1, fadeOutSec: 0.1 })
  }), 'normalized.wav', 'audio/')
  assert.equal(normalized.facts.streams[0].codec_name, 'pcm_s16le')
  const timeline = await output(await post('/render-timeline', {
    plan: { inputs: [{}], filterComplex: '[0:a]anull[mix]', outLabel: '[mix]', sampleRate: 48000 },
    files: [{ b64: tone.toString('base64') }]
  }), 'timeline.wav', 'audio/wav')
  assert.ok(Math.abs(Number(timeline.facts.format.duration) - 1) < 0.02)
  const videoPath = join(dir, 'source.mp4')
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=12:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoPath])
  const composite = await output(await post('/render-composite', {
    plan: { inputs: [{}], overlayInputs: [], filterComplex: '[0:v]format=yuv420p[vout]', vLabel: '[vout]', aLabel: null, profile: { fps: 12, videoBitrate: '200k' } },
    files: [{ b64: readFileSync(videoPath).toString('base64') }]
  }), 'composite.mp4', 'video/mp4')
  assert.equal(composite.facts.streams[0].codec_name, 'h264')
  assert.equal(composite.facts.streams[0].width, 64)
  const copyHtml = '<html><body style="margin:0;background:white"><div data-storyboard-copy-id="copy1" style="position:absolute;left:5px;top:5px;color:black;background:white;font:16px Arial">Test</div></body></html>'
  const copy = { html: copyHtml, width: 128, height: 64, fps: 2, durationSec: 0.5, required: [{ clipId: 'copy1', text: 'Test', startSec: 0, durationSec: 0.5 }] }
  const measured = await post('/measure-copy', copy)
  assert.equal(measured.status, 200, logs)
  assert.deepEqual((await measured.json()).findings, [])
  const mismatch = await post('/measure-copy', { ...copy, required: [{ ...copy.required[0], text: 'Wrong' }] })
  assert.equal(mismatch.status, 200)
  assert.ok((await mismatch.json()).findings.some(f => f.code === 'COPY_TEXT_MISMATCH'))
  // Exercise Chromium overlay capture AND ffmpeg composition in the packaged service.
  const overlay = await output(await post('/render-composite', {
    plan: { inputs: [{}], overlayInputs: [{ clipId: 'copy1', framesPattern: 'copy/%05d.png', fps: 2 }], filterComplex: '[0:v]scale=128:64[base];[base][1:v]overlay=shortest=1[vout]', vLabel: '[vout]', aLabel: null, profile: { fps: 2, videoBitrate: '200k' } },
    files: [{ b64: readFileSync(videoPath).toString('base64') }],
    overlays: [{ ...copy, clipId: 'copy1', framesPattern: 'copy/%05d.png', requiredCopy: copy.required }]
  }), 'overlay.mp4', 'video/mp4')
  assert.equal(overlay.facts.streams[0].width, 128)
  // A footage-bearing overlay must have a decodable first frame. A black
  // screenshot is not a successful render when the embedded media failed.
  const embeddedVideo = (source, fps = 2, times = [0]) => ({
    plan: { inputs: [{}], overlayInputs: [{ clipId: 'footage', framesPattern: 'footage/%05d.png', fps }], filterComplex: `[0:v]fps=${fps},scale=128:64,drawbox=color=red:t=fill[base];[base][1:v]overlay=shortest=1[vout]`, vLabel: '[vout]', aLabel: null, profile: { fps, videoBitrate: '200k' } },
    files: [{ b64: readFileSync(videoPath).toString('base64') }],
    overlays: [{ clipId: 'footage', framesPattern: 'footage/%05d.png', width: 128, height: 64, fps, durationSec: times.length / fps,
      html: `<html><body style="margin:0;background:transparent"><video muted playsinline preload="auto" style="width:128px;height:64px" src="data:video/mp4;base64,${source}"></video><script>const video=document.querySelector('video');const clock=setInterval(()=>{if(video.readyState>=1)video.currentTime=(video.currentTime+0.1)%0.8},1);window.__engagrFrame={ready:true,duration:${times.length / fps},seek(t){clearInterval(clock);video.pause();if(video.readyState>=1)video.currentTime=${JSON.stringify(times)}[Math.round(t*${fps})]}}</script></body></html>` }]
  })
  const embedded = await output(await post('/render-composite', embeddedVideo(readFileSync(videoPath).toString('base64'))), 'embedded-video.mp4', 'video/mp4')
  const firstVideoPixel = ffmpeg(['-i', embedded.path, '-frames:v', '1', '-vf', 'crop=2:2:64:32,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
  assert.ok(firstVideoPixel[2] > firstVideoPixel[0] + 100, 'first overlay frame contains blue footage, not the red base')
  assert.equal((await post('/render-composite', embeddedVideo(Buffer.from('invalid-video').toString('base64')))).status, 500, 'failed embedded footage must not become a blank successful export')
  // Long-GOP footage makes a seek asynchronous even though currentTime already
  // reports the destination. The visible patch identifies each requested source time.
  const movingPath = join(dir, 'moving.mp4')
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=960x540:r=30:d=5', '-vf', [
    "drawbox=x=iw/4:y=ih/4:w=iw/2:h=ih/2:color=blue:t=fill:enable='lt(t,1)'",
    "drawbox=x=iw/4:y=ih/4:w=iw/2:h=ih/2:color=lime:t=fill:enable='between(t,1,3)'",
    "drawbox=x=iw/4:y=ih/4:w=iw/2:h=ih/2:color=yellow:t=fill:enable='gt(t,3)'"
  ].join(','), '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2',
  '-x264-params', 'keyint=300:min-keyint=300:scenecut=0', '-pix_fmt', 'yuv420p', movingPath])
  const moving = embeddedVideo(readFileSync(movingPath).toString('base64'), 4, [0, 4.5, 2.5, 4.5])
  const renderedMotion = await output(await post('/render-composite', moving), 'moving-video.mp4', 'video/mp4')
  const sample = ffmpeg(['-i', renderedMotion.path, '-vf', 'crop=2:2:64:32,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
  assert.equal(sample.length, 12, 'four output frames')
  const colors = []
  for (let i = 0; i < sample.length; i += 3) {
    colors.push(Array.from(sample.subarray(i, i + 3), channel => channel > 128 ? 1 : 0).join(''))
  }
  assert.deepEqual(colors, ['001', '110', '010', '110'], 'visible video follows each forward and backward media seek')
  const html = '<html><body style="margin:0;background:#e02020;width:64px;height:64px"><script>window.__engagrFrame={ready:true,duration:0.5,seek(t){document.body.style.background=t<0.25?"#e02020":"#2020e0"}}</script></body></html>'
  const banner = await output(await post('/render-banner', { html, width: 64, height: 64, fps: 12, crf: 23, quality: 1 }), 'banner.mp4', 'video/mp4')
  assert.equal(banner.facts.streams[0].codec_name, 'h264')
  assert.equal(Number(banner.facts.streams[0].nb_frames), 6)
  const frame = t => ffmpeg(['-ss', String(t), '-i', banner.path, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
  const first = frame(0), last = frame(0.4)
  assert.ok(first[0] > first[2] + 100, 'first frame is red')
  assert.ok(last[2] > last[0] + 100, 'last frame is blue: frame seeking works')
  // Rejection must leave the service usable for the next job.
  assert.equal((await post('/render', tone)).status, 400)
  assert.equal((await post('/measure-copy', { html: '<script>alert(1)</script>' })).status, 422)
  assert.equal((await fetch(origin + '/missing')).status, 404)
  assert.equal((await fetch(origin + '/health')).status, 200)
  // A rollout sends SIGTERM. An accepted request must finish before the process exits.
  const exited = once(server, 'exit')
  const chromiumRender = post('/render-banner', { html: html.replace('duration:0.5', 'duration:2'), width: 64, height: 64, fps: 24, crf: 23, quality: 1 })
  // Observe the real child process instead of guessing its startup time. Puppeteer's
  // signal handlers are installed before Chromium launches.
  let chromiumActive = false
  for (let n = 0; n < 300; n++) {
    chromiumActive = readdirSync('/proc').some((pid) => {
      if (!/^\d+$/.test(pid)) return false
      try {
        return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('/usr/lib/chromium/chromium')
      } catch {
        return false
      }
    })
    if (chromiumActive) break
    await delay(50)
  }
  assert.ok(chromiumActive, 'Chromium is active before termination')
  const draining = new Promise((resolve, reject) => {
    const req = request(origin + '/render', {
      method: 'POST', headers: { 'content-length': String(tone.length), 'x-audio-profile': JSON.stringify({ format: 'wav', lufs: -16, truePeak: -1, lra: 11 }) }
    }, async (res) => {
      try {
        const chunks = []
        for await (const chunk of res) chunks.push(chunk)
        assert.equal(res.statusCode, 200)
        assert.ok(Buffer.concat(chunks).length > 44)
        resolve()
      } catch (error) { reject(error) }
    })
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('Drain timeout')))
    req.flushHeaders()
    req.write(tone.subarray(0, 100))
    delay(200).then(() => {
      server.kill(drainSignal)
      return delay(100)
    }).then(() => req.end(tone.subarray(100))).catch(reject)
  })
  await draining
  await output(await chromiumRender, 'drained-banner.mp4', 'video/mp4')
  assert.deepEqual(await exited, [0, null], `Graceful shutdown: ${logs}`)
  console.log(`PASS: packaged HTTP media/Chromium acceptance, full decode, rejection/recovery and ${drainSignal} request drain`)
} finally {
  server.kill('SIGKILL')
  rmSync(dir, { recursive: true, force: true })
}
