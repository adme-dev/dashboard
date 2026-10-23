import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { zipSync, strToU8 } from 'fflate'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { source } from './fixture'

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
