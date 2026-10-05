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
