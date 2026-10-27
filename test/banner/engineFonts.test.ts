import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertSupportedText, FONT_FACE, FONT_PIN, inspectPinnedFont, verifyFontInContainer, executeFontContainer, loadFontRuntime } from '../../workers/banner-engine/fonts/runtime.mjs'

const font = { ...FONT_FACE, coverage: [32, 65, 66, 67] }
const layer = { fontFamily: 'Source Sans 3', fontWeight: 700, fontStyle: 'normal', fontSize: 100 }
describe('pinned Linux native font contract', () => {
  it('accepts only the exact proven face and covered text', () => {
    expect(() => assertSupportedText(layer, 'AB C', font)).not.toThrow()
    for (const changed of [{ fontFamily: 'Arial' }, { fontWeight: 900 }, { fontWeight: 400 }, { fontStyle: 'italic' }]) {
      expect(() => assertSupportedText({ ...layer, ...changed }, 'ABC', font)).toThrow()
    }
  })
  it('rejects missing glyphs, control characters, complex scripts and oversized measurement', () => {
    for (const text of ['D', '😀', '漢', 'A\nB', 'A\u0000B', 'A\u0301', 'A'.repeat(2000)]) {
      expect(() => assertSupportedText(layer, text, font)).toThrow()
    }
  })
  it('rejects unpinned font bytes before parsing any font structures', () => {
    expect(() => inspectPinnedFont(Buffer.alloc(200))).toThrow('checksum')
  })
  it('fails missing or tampered actual container font and never executes a selected path', async () => {
    const calls: string[][] = []
    await expect(verifyFontInContainer('banner-engine-test', async (args) => {
      calls.push(args)
      return 'bad  file'
    })).rejects.toThrow('checksum')
    expect(calls[0]).toEqual(['exec', 'banner-engine-test', '/usr/bin/sha256sum', '/usr/share/fonts/truetype/banner/SourceSans3-Bold.ttf'])
    await expect(verifyFontInContainer('banner-engine-test', async () => {
      throw new Error('No such file')
    })).rejects.toThrow('No such file')
  })
  it('rejects invalid sizes and absent face capabilities', () => {
    for (const fontSize of [0, -1, NaN, Infinity, 513]) {
      expect(() => assertSupportedText({ ...layer, fontSize }, 'ABC', font)).toThrow()
    }
    expect(() => assertSupportedText(layer, 'ABC', { ...font, postscriptName: 'Fallback-Bold' })).toThrow()
    expect(() => assertSupportedText(layer, '', font)).toThrow()
  })
  it('cannot override the mandatory same-container font verification', async () => {
    await expect(executeFontContainer({ font: FONT_PIN }, { beforeExecute: () => {} })).rejects.toThrow('cannot be overridden')
    await expect(executeFontContainer({}, {})).rejects.toThrow('Font runtime required')
  })
  it('rejects legacy, wrong-version and modified font manifests before using artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'banner-font-manifest-'))
    const path = join(root, 'runtime.json')
    try {
      for (const manifest of [{}, { fontVersion: 'banner-linux-fonts-v2' }, { fontVersion: 'banner-linux-fonts-v1', font: { ...FONT_PIN, sha256: 'a'.repeat(64) } }, { fontVersion: 'banner-linux-fonts-v1', font: { ...FONT_PIN, weight: 900 } }]) {
        await writeFile(path, JSON.stringify(manifest))
        await expect(loadFontRuntime('photocraft', path)).rejects.toThrow(/font runtime|manifest mismatch/)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
