/** Local synthetic acceptance evidence; no provider, database or deployment access.
 * node scripts/video-storyboard-render-fixture.mjs [outputDir] [chromiumExecutable]
 * Uses an existing Chromium installation; never downloads a browser. */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { captureOverlay } from '../workers/audio-jobs/container/overlayCapture.mjs'
import { measureStaticCopy, validateStaticCopy } from '../workers/audio-jobs/container/copyMeasurement.mjs'
import { buildCompositePlan, buildCompositeRenderArgs } from '../workers/audio-jobs/container/videoCompositeGraph.mjs'
import { DEFAULT_VIDEO_FORMATS } from '../workers/audio-jobs/container/videoProfiles.mjs'

const out = resolve(process.argv[2] || '.verification/storyboard-t08-render')
mkdirSync(out, { recursive: true })
function run(bin, args) {
  const result = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${bin}: ${result.stderr.slice(-3000)}`)
  return { stdout: result.stdout, stderr: result.stderr }
}
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const adapted = { newPage: async () => {
  const p = await browser.newPage()
  p.setViewport = ({ width, height }) => p.setViewportSize({ width, height })
  return p
} }
const duration = 0.4
const marker = createHash('sha256').update(JSON.stringify({ clipId: 'sb:application:shot:caption', copyId: 'disclaimer' })).digest('hex')
const text = 'Exact copy — terms apply. Café 123.'
const results = []
try {
  run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', String(duration), join(out, 'tone.wav')])
  for (const [format, profile] of Object.entries(DEFAULT_VIDEO_FORMATS)) {
    const dir = join(out, format)
    mkdirSync(dir, { recursive: true })
    const html = `<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;background:transparent} .copy{position:absolute;left:6%;right:6%;top:40%;font:48px Arial;color:white;background:black;white-space:pre-wrap;overflow-wrap:break-word}</style></head><body><div class="copy" data-storyboard-copy-id="${marker}">${text}</div></body></html>`
    const required = [{ clipId: marker, text, startSec: 0, durationSec: duration }]
    const input = { html, width: profile.width, height: profile.height, durationSec: duration, fps: profile.fps, required }
    const measured = await measureStaticCopy(adapted, input)
    if (measured.findings.length) throw new Error(JSON.stringify(measured))
    const frames = join(dir, 'frames')
    await captureOverlay(adapted, { ...input, outDir: frames, requiredCopy: required })
    const state = { schema_version: 2, media_type: 'av', sample_rate: 48000, ducking: [], master: { gain_db: 0 }, tracks: [{ id: 'a', name: 'Audio', kind: 'voiceover', gain_db: 0, muted: false, clips: [{ id: 'tone', r2_key: 'tone.wav', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: duration, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0 }] }] }
    const plan = buildCompositePlan(state, profile, [{ clipId: 'copy', framesPattern: join(frames, 'ovl_%05d.png'), fps: profile.fps, timeline_start_sec: 0, duration_sec: duration }])
    const mp4 = join(dir, 'output.mp4')
    run('ffmpeg', buildCompositeRenderArgs(plan, [join(out, 'tone.wav')], mp4))
    run('ffmpeg', ['-y', '-i', mp4, '-frames:v', '1', join(dir, 'actual-frame.png')])
    const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp4]).stdout)
    const stats = run('ffmpeg', ['-i', mp4, '-af', 'astats=metadata=1:reset=0', '-f', 'null', '-']).stderr
    const audioRms = stats.match(/RMS level dB: (-?[\d.]+)/)?.[1]
    if (!audioRms || !probe.streams.some(s => s.codec_type === 'audio')) throw new Error('Missing audible fixture audio')
    results.push({ format, width: profile.width, height: profile.height, measurement: measured, videoCodec: probe.streams.find(s => s.codec_type === 'video')?.codec_name, audioCodec: probe.streams.find(s => s.codec_type === 'audio')?.codec_name, audioRmsDb: Number(audioRms), duration: probe.format.duration, mp4 })
  }
  const rejectionInputs = { font: 'font-family:MissingFont', overflow: 'left:99%;white-space:nowrap', hidden: 'opacity:0', ellipsis: 'text-overflow:ellipsis', animated: 'animation:pulse 1s infinite' }
  const rejections = {}
  const positives = {}
  for (const [name, style, text] of [
    ['canonicalNearBlack', 'background:#0a0a10;color:white', 'Exact copy'],
    ['preservedWhitespace', 'background:white;color:black;white-space:pre-wrap', 'Exact\ncopy\t  retained']
  ]) {
    const result = await measureStaticCopy(adapted, { html: `<div data-storyboard-copy-id="c" style="position:absolute;left:20px;top:20px;font:32px Arial;${style}">${text}</div>`, width: 640, height: 480, durationSec: 1, fps: 30, required: [{ clipId: 'c', text, startSec: 0, durationSec: 1 }] })
    if (result.findings.length) throw new Error(`${name} positive rejected: ${JSON.stringify(result)}`)
    positives[name] = result
  }
  const profileNegative = {
    scaledText: { style: 'transform:scale(1.1)', text: 'Exact copy' },
    translatedText: { style: 'transform:translateX(1px)', text: 'Exact copy' },
    rotatedText: { style: 'transform:rotate(1deg)', text: 'Exact copy' },
    legacyClip: { style: 'clip:rect(0,0,0,0)', text: 'Exact copy' },
    firstLine: { style: '', css: '.copy::first-line{color:transparent}', text: 'Exact copy' },
    firstLetter: { style: '', css: '.copy::first-letter{color:transparent}', text: 'Exact copy' },
    blackOnBlack: { style: 'color:black;background:black', text: 'Exact copy' },
    collapsedNewline: { style: 'white-space:normal', text: 'Exact\ncopy' },
    collapsedTab: { style: 'white-space:normal', text: 'Exact\tcopy' },
    bidiOverride: { style: 'direction:rtl;unicode-bidi:bidi-override', text: 'Exact copy' },
    noOpaquePlate: { style: 'background:transparent', text: 'Exact copy' }
  }
  for (const [name, sample] of Object.entries(profileNegative)) {
    const html = `<style>${sample.css || ''}</style><div class="copy" data-storyboard-copy-id="c" style="position:absolute;left:20px;top:20px;font:32px Arial;color:white;background:black;white-space:pre-wrap;${sample.style}">${sample.text}</div>`
    const result = await measureStaticCopy(adapted, { html, width: 320, height: 240, durationSec: 1, fps: 30, required: [{ clipId: 'c', text: sample.text, startSec: 0, durationSec: 1 }] })
    if (!result.findings.length) throw new Error(`${name} escaped explicit static text profile`)
    rejections[name] = result.findings
  }
  for (const tag of ['animate', 'animateTransform', 'animateMotion', 'set', 'discard', 'marquee']) {
    try {
      validateStaticCopy({ html: `<svg><${tag}></${tag}></svg>`, width: 320, height: 240, durationSec: 1, fps: 30, required: [{ clipId: 'c', text: 'Exact copy', startSec: 0, durationSec: 1 }] })
      throw new Error(`${tag} escaped static validation`)
    } catch (error) {
      if (error.message !== 'Unsupported static copy input') throw error
      rejections[tag] = 'rejected before setContent'
    }
  }
  for (const [name, html] of Object.entries({
    emptyPseudoCover: '<style>.copy::after{content:"";position:absolute;inset:0;background:white}</style><div class="copy" data-storyboard-copy-id="c" style="position:absolute;left:20px;top:20px;font:32px Arial;color:white;background:black;white-space:pre-wrap">Exact copy</div>',
    outsideBoxShadow: '<div data-storyboard-copy-id="c" style="position:absolute;left:20px;top:20px;font:32px Arial;color:white;background:black;white-space:pre-wrap">Exact copy</div><div style="position:absolute;left:300px;top:20px;width:1px;height:1px;box-shadow:-200px 0 0 100px white"></div>',
    outsideFilterShadow: '<div data-storyboard-copy-id="c" style="position:absolute;left:20px;top:20px;font:32px Arial;color:white;background:black;white-space:pre-wrap">Exact copy</div><div style="position:absolute;left:300px;top:20px;width:1px;height:1px;background:white;filter:drop-shadow(-200px 0 50px white)"></div>'
  })) {
    const result = await measureStaticCopy(adapted, { html, width: 320, height: 240, durationSec: 1, fps: 30, required: [{ clipId: 'c', text: 'Exact copy', startSec: 0, durationSec: 1 }] })
    if (!result.findings.some(f => f.code === 'COPY_STYLE_UNSUPPORTED')) throw new Error(`${name} escaped supported static paint profile`)
    rejections[name] = result.findings
  }
  const coveredChild = await measureStaticCopy(adapted, { html: '<div data-storyboard-copy-id="c" style="position:absolute;left:20px;top:20px;font:32px Arial;color:white;background:black;white-space:pre-wrap">Exact copy<span style="position:absolute;inset:0;background:white"></span></div>', width: 320, height: 240, durationSec: 1, fps: 30, required: [{ clipId: 'c', text: 'Exact copy', startSec: 0, durationSec: 1 }] })
  if (!coveredChild.findings.some(f => f.code === 'COPY_MARKUP_UNSUPPORTED')) throw new Error('Opaque child covering copy escaped measurement')
  rejections.coveredChild = coveredChild.findings
  const nested = await measureStaticCopy(adapted, { html: '<div style="font:32px Arial;color:white;background:black;white-space:pre-wrap" data-storyboard-copy-id="c"><span style="opacity:0">Exact copy</span></div>', width: 320, height: 240, durationSec: 1, fps: 30, required: [{ clipId: 'c', text: 'Exact copy', startSec: 0, durationSec: 1 }] })
  if (!nested.findings.some(f => f.code === 'COPY_HIDDEN')) throw new Error('Nested hidden copy escaped measurement')
  rejections.nestedHidden = nested.findings
  try {
    await measureStaticCopy(adapted, { html: '<meta http-equiv="refresh" content="0;url=https://example.com"><div data-storyboard-copy-id="c">Exact copy</div>', width: 320, height: 240, durationSec: 1, fps: 30, required: [{ clipId: 'c', text: 'Exact copy', startSec: 0, durationSec: 1 }] })
    throw new Error('Meta refresh escaped measurement')
  } catch (error) {
    if (error.message !== 'Unsupported static copy input') throw error
    rejections.metaRefresh = 'rejected before setContent'
  }
  for (const [name, style] of Object.entries(rejectionInputs)) {
    const html = `<style>@keyframes pulse{from{opacity:1}to{opacity:0}}</style><div data-storyboard-copy-id="c" style="position:absolute;left:20px;top:20px;font:32px Arial;color:white;background:black;white-space:pre-wrap;${style}">Exact copy</div>`
    rejections[name] = (await measureStaticCopy(adapted, { html, width: 320, height: 240, durationSec: 1, fps: 30, required: [{ clipId: 'c', text: 'Exact copy', startSec: 0, durationSec: 1 }] })).findings
    if (!rejections[name].length) throw new Error(`Expected ${name} rejection`)
  }
  writeFileSync(join(out, 'receipt.json'), JSON.stringify({ browser: await browser.version(), ffmpeg: run('ffmpeg', ['-version']).stdout.split('\n')[0], platform: process.platform, renderer: 'actual container modules with local Chromium adapter and local FFmpeg; not Linux image or hosted service', results, positives, rejections }, null, 2))
  console.log(JSON.stringify({ out, results, positives, rejections }, null, 2))
} finally { await browser.close() }
