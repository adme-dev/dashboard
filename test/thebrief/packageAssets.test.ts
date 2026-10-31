import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { zipSync, strToU8 } from 'fflate'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { source } from './fixture'

it('bakes a centered horizontal reflection without changing another use of the same original asset', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'thebrief-mirror-'))
  try {
    const pixels = Buffer.from([255, 0, 0, 0, 0, 255])
    const png = await sharp(pixels, { raw: { width: 2, height: 1, channels: 3 } }).png().toBuffer()
    const html = source.replace('background:#fff', 'background:#fff;background-image:url(./art.png);background-size:cover;background-position:center')
      .replace('designData:{', 'designData:{designHash:"mirror1",')
      .replace('data-eltype="text"', 'data-eltype="image"')
      .replace('<div class="row">Hello world</div>', '<div style="width:100%;height:100%;transform:rotate(0) scale(-1,1)"><img src="./art.png"></div>')
    const entries = { 'index.html': strToU8(html), 'art.png': png }
    for (const [name, bytes] of Object.entries(entries)) writeFileSync(join(directory, name), bytes)
    const archive = join(directory, 'source.zip'), output = join(directory, 'package.json')
    writeFileSync(archive, zipSync(entries))
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/thebrief/package-import.mjs', directory, archive, 'Mirrored artwork', output], {
      cwd: resolve('.'), env: { ...process.env, TSX_TSCONFIG_PATH: 'scripts/thebrief/tsconfig.json' }, timeout: 20000
    })
    const result = JSON.parse(readFileSync(output, 'utf8'))
    expect(result.assets).toHaveLength(2)
    for (const layer of result.canvasData.custom_300x250.layers) {
      const asset = result.assets.find(a => a.path === layer.src)
      const actual = await sharp(Buffer.from(asset.base64, 'base64')).removeAlpha().raw().toBuffer()
      expect(actual).toEqual(layer.type === 'bg' ? pixels : Buffer.from([0, 0, 255, 255, 0, 0]))
    }
    expect(readFileSync(join(directory, 'art.png'))).toEqual(png)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 25000)

it('packages identical image bytes at different source paths only once', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'thebrief-assets-'))
  try {
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ff0000' } }).png().toBuffer()
    const html = source.replace('background:#fff', 'background:#fff;background-image:url(./one.png);background-size:cover;background-position:center')
      .replace('designData:{', 'designData:{designHash:"fixture1",')
      .replace('data-eltype="text"', 'data-eltype="image"')
      .replace('<div class="row">Hello world</div>', '<img src="./two.png">')
    const entries = { 'index.html': strToU8(html), 'one.png': png, 'two.png': png }
    for (const [name, bytes] of Object.entries(entries)) writeFileSync(join(directory, name), bytes)
    const archive = join(directory, 'source.zip')
    const output = join(directory, 'package.json')
    writeFileSync(archive, zipSync(entries))
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/thebrief/package-import.mjs', directory, archive, 'Duplicate artwork', output], {
      cwd: resolve('.'), env: { ...process.env, TSX_TSCONFIG_PATH: 'scripts/thebrief/tsconfig.json' }, timeout: 20000
    })
    const result = JSON.parse(readFileSync(output, 'utf8'))
    expect(result.assets).toHaveLength(1)
    const images = result.canvasData.custom_300x250.layers.filter(layer => layer.src)
    expect(images).toHaveLength(2)
    expect(images.map(layer => layer.src)).toEqual([result.assets[0].path, result.assets[0].path])
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 25000)

it('preserves namespaced font bytes and exact weights without colliding with a similar family', () => {
  const directory = mkdtempSync(join(tmpdir(), 'thebrief-font-names-'))
  try {
    const namespaced = 'UseR-UploAdeD/Suzuki-Bold'
    const similar = 'UseR-UploAdeD Suzuki-Bold'
    const firstFont = Buffer.from('000100000000000000000001', 'hex')
    const secondFont = Buffer.from('000100000000000000000002', 'hex')
    const html = source.replace('<style>', `<style>
      @font-face{font-family:'${namespaced}';font-weight:325;src:url('./one.ttf') format('truetype')}
      @font-face{font-family:'${similar}';font-weight:700;src:url('./two.ttf') format('truetype')}`)
      .replace('designData:{', 'designData:{designHash:"font-fixture",')
      .replace('font-family:Arial', `font-family:'${namespaced}'`)
      .replace('font-weight:700;color:', 'font-weight:325;color:')
      .replace('Hello world</div>', `First</div><div class="row" style="font-family:'${similar}';font-weight:700">Second</div>`)
      .replace('height:80px', 'height:57.6px')
    const entries = { 'index.html': strToU8(html), 'one.ttf': firstFont, 'two.ttf': secondFont }
    for (const [name, bytes] of Object.entries(entries)) writeFileSync(join(directory, name), bytes)
    const archive = join(directory, 'source.zip'), output = join(directory, 'package.json')
    writeFileSync(archive, zipSync(entries))
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/thebrief/package-import.mjs', directory, archive, 'Namespaced fonts', output], {
      cwd: resolve('.'), env: { ...process.env, TSX_TSCONFIG_PATH: 'scripts/thebrief/tsconfig.json' }, timeout: 20000
    })
    const result = JSON.parse(readFileSync(output, 'utf8'))
    expect(result.fonts.map(font => Buffer.from(font.base64, 'base64'))).toEqual([firstFont, secondFont])
    expect(new Set(result.fonts.map(font => font.family)).size).toBe(2)
    expect(result.fonts.every(font => /^[\w .-]+$/.test(font.family))).toBe(true)
    const text = result.canvasData.custom_300x250.layers.filter(layer => layer.type === 'text')
    expect(text.map(layer => [layer.fontFamily, layer.fontWeight])).toEqual(result.fonts.map(font => [font.family, font.weight]))
    expect(text.map(layer => layer.fontWeight)).toEqual([325, 700])
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 25000)

it('keeps normal and italic faces separate at the same weight in packages and comparison previews', () => {
  const directory = mkdtempSync(join(tmpdir(), 'thebrief-italic-'))
  const preview = mkdtempSync(join(tmpdir(), 'thebrief-italic-preview-'))
  try {
    const html = source.replace('<style>', `<style>@font-face{font-family:'Demo';font-weight:700;font-style:normal;src:url('./normal.ttf') format('truetype')}@font-face{font-family:'Demo';font-weight:700;font-style:italic;src:url('./italic.ttf') format('truetype')}`)
      .replace('designData:{', 'designData:{designHash:"italic-fixture",')
      .replace('font-family:Arial', 'font-family:Demo')
      .replace('Hello world</div>', 'Normal</div><div class="row" style="font-style:italic">Italic</div>').replace('height:80px', 'height:57.6px')
    const normal = Buffer.from('000100000000000000000001', 'hex'), italic = Buffer.from('000100000000000000000002', 'hex')
    const entries = { 'index.html': strToU8(html), 'normal.ttf': normal, 'italic.ttf': italic }
    for (const [name, bytes] of Object.entries(entries)) writeFileSync(join(directory, name), bytes)
    const archive = join(directory, 'source.zip'), output = join(directory, 'package.json')
    writeFileSync(archive, zipSync(entries))
    const options = { cwd: resolve('.'), env: { ...process.env, TSX_TSCONFIG_PATH: 'scripts/thebrief/tsconfig.json' }, timeout: 20000 }
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/thebrief/package-import.mjs', directory, archive, 'Italic faces', output], options)
    const result = JSON.parse(readFileSync(output, 'utf8'))
    expect(result.fonts.map(font => font.style)).toEqual(['normal', 'normal'])
    expect(result.fonts[1].family).toContain(' Italic XF ')
    expect(result.fonts[0].family).not.toBe(result.fonts[1].family)
    expect(result.canvasData.custom_300x250.layers.filter(layer => layer.type === 'text').map(layer => layer.fontFamily)).toEqual(result.fonts.map(font => font.family))
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/thebrief/preview-pilot.mjs', directory, preview], options)
    const native = readFileSync(join(preview, 'native.html'), 'utf8')
    expect(native).toContain('font-family: \'Source 0 Demo\'')
    expect(native).toContain('font-family: \'Source 1 Demo\'')
    expect(native).not.toContain('font-style:italic;')
    const reference = readFileSync(join(preview, 'reference.html'), 'utf8')
    expect(reference).toContain('font-style:italic')
    expect(reference).not.toContain('url(\'./normal.ttf\')')
    expect(reference).toContain('await readiness')
    expect(native).toContain('await readiness')
    expect(readFileSync(join(preview, 'index.html'), 'utf8')).toContain('Testing not ready: ')
    for (const bytes of [normal, italic]) {
      const embedded = `data:font/ttf;base64,${bytes.toString('base64')}`
      expect(native).toContain(embedded)
      expect(reference).toContain(embedded)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
    rmSync(preview, { recursive: true, force: true })
  }
}, 25000)

it('bakes a centered vertical reflection', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'thebrief-flip-'))
  try {
    const pixels = Buffer.from([255, 0, 0, 0, 0, 255])
    const png = await sharp(pixels, { raw: { width: 1, height: 2, channels: 3 } }).png().toBuffer()
    const html = source.replace('designData:{', 'designData:{designHash:"flip1",')
      .replace('data-eltype="text"', 'data-eltype="image"')
      .replace('<div class="row">Hello world</div>', '<div style="width:100%;height:100%;transform:rotate(0) scale(1,-1)"><img src="./art.png"></div>')
    const entries = { 'index.html': strToU8(html), 'art.png': png }
    for (const [name, bytes] of Object.entries(entries)) writeFileSync(join(directory, name), bytes)
    const archive = join(directory, 'source.zip'), output = join(directory, 'package.json')
    writeFileSync(archive, zipSync(entries))
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/thebrief/package-import.mjs', directory, archive, 'Flipped artwork', output], {
      cwd: resolve('.'), env: { ...process.env, TSX_TSCONFIG_PATH: 'scripts/thebrief/tsconfig.json' }, timeout: 20000
    })
    const result = JSON.parse(readFileSync(output, 'utf8'))
    const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'image')
    const asset = result.assets.find(a => a.path === layer.src)
    expect(await sharp(Buffer.from(asset.base64, 'base64')).removeAlpha().raw().toBuffer()).toEqual(Buffer.from([0, 0, 255, 255, 0, 0]))
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 25000)

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
    return true
  } catch { return false }
})()

it.skipIf(!hasFfmpeg)('packages the original H.264 bytes for a video layer and holds a clip end beyond the file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'thebrief-video-'))
  try {
    const clip = join(directory, 'clip.mp4')
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x36:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip])
    const bytes = readFileSync(clip)
    const build = (endTime: number) => source.replace('designData:{', 'designData:{designHash:"video1",')
      .replace('customAnimations:[]', `customAnimations:[],videoElements:[{elementId:1,slideId:1,volume:0,startTime:0,endTime:${endTime},soundOnHover:false,delay:0.2,autoplay:true,loop:true,keepPlayingPastSlide:false,src:"./clip.mp4"}]`)
      .replace('data-eltype="text"', 'data-eltype="video"')
      .replace('<div class="row">Hello world</div>', '<video src="./clip.mp4" muted autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video>')
    const run = (endTime: number) => {
      const entries = { 'index.html': strToU8(build(endTime)), 'clip.mp4': new Uint8Array(bytes) }
      writeFileSync(join(directory, 'index.html'), entries['index.html'])
      const archive = join(directory, 'source.zip'), output = join(directory, 'package.json')
      writeFileSync(archive, zipSync(entries))
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/thebrief/package-import.mjs', directory, archive, 'Video artwork', output], {
        cwd: resolve('.'), env: { ...process.env, TSX_TSCONFIG_PATH: 'scripts/thebrief/tsconfig.json' }, timeout: 30000, stdio: 'pipe'
      })
      return JSON.parse(readFileSync(output, 'utf8'))
    }
    const result = run(1)
    const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'video')
    expect(layer).toMatchObject({ mediaStart: 0, mediaEnd: 1, mediaLoop: true })
    const asset = result.assets.find(a => a.path === layer.src)
    expect(asset.mimeType).toBe('video/mp4')
    expect(Buffer.from(asset.base64, 'base64')).toEqual(bytes)
    expect(() => run(5)).toThrow(/exceeds the .*s file/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 60000)
