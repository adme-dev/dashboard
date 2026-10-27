import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dockerCommand, executeLinuxContainer, loadLinuxRuntime } from '../runtime/render-preview.mjs'

export const fontRuntimeRoot = fileURLToPath(new URL('../../../output/editable-artwork-linux-native/fonts-v1/', import.meta.url))
export const FONT_FACE = Object.freeze({ family: 'Source Sans 3', weight: 700, italic: false, postscriptName: 'SourceSans3-Bold' })
export const FONT_PIN = Object.freeze({
  ...FONT_FACE,
  version: '3.052',
  commit: 'ed1808970eb3c7301c9a523bee26473ba0bb62fa',
  file: 'SourceSans3-Bold.ttf',
  sha256: '9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a',
  licenseSha256: '89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c',
  containerPath: '/usr/share/fonts/truetype/banner/SourceSans3-Bold.ttf'
})
export const sha256 = data => createHash('sha256').update(data).digest('hex')
const permitted = code => (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || [0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022].includes(code)

/** Parse only the exact pinned static SFNT, never user-uploaded font programs. */
export function inspectPinnedFont(bytes) {
  assert.equal(sha256(bytes), FONT_PIN.sha256, 'Font checksum mismatch')
  assert.equal(bytes.readUInt32BE(0), 0x00010000, 'Expected TrueType static font')
  const tables = {}
  for (let i = 0; i < bytes.readUInt16BE(4); i++) {
    const offset = 12 + i * 16
    const tag = bytes.toString('ascii', offset, offset + 4)
    const start = bytes.readUInt32BE(offset + 8), length = bytes.readUInt32BE(offset + 12)
    tables[tag] = bytes.subarray(start, start + length)
  }
  assert(!tables.fvar, 'Variable fonts are not supported')
  const names = {}
  const name = tables.name, stringOffset = name.readUInt16BE(4)
  for (let i = 0; i < name.readUInt16BE(2); i++) {
    const p = 6 + i * 12
    if (name.readUInt16BE(p) !== 3 || name.readUInt16BE(p + 4) !== 0x409) continue
    const start = stringOffset + name.readUInt16BE(p + 10), length = name.readUInt16BE(p + 8)
    const value = Buffer.from(name.subarray(start, start + length)).swap16().toString('utf16le')
    names[name.readUInt16BE(p + 6)] = value
  }
  assert.equal(names[16] ?? names[1], FONT_FACE.family)
  assert.equal(names[6], FONT_FACE.postscriptName)
  assert(names[5].includes(FONT_PIN.version), 'Font version mismatch')
  assert.equal(tables['OS/2'].readUInt16BE(4), FONT_FACE.weight)
  assert.equal(tables['OS/2'].readUInt16BE(62) & 1, 0, 'Unexpected italic face')
  const cmap = tables.cmap
  let unicode
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const p = 4 + i * 8, start = cmap.readUInt32BE(p + 4)
    if (cmap.readUInt16BE(p) === 3 && cmap.readUInt16BE(p + 2) === 1 && cmap.readUInt16BE(start) === 4) unicode = cmap.subarray(start)
  }
  assert(unicode, 'Expected Unicode BMP cmap')
  const segments = unicode.readUInt16BE(6) / 2
  const glyphs = {}
  const advances = {}
  for (let code = 32; code <= 0x2022; code++) {
    if (!permitted(code)) continue
    let glyph = 0
    for (let i = 0; i < segments; i++) {
      const end = unicode.readUInt16BE(14 + i * 2), start = unicode.readUInt16BE(16 + segments * 2 + i * 2)
      if (code < start || code > end) continue
      const delta = unicode.readInt16BE(16 + segments * 4 + i * 2), at = 16 + segments * 6 + i * 2
      const offset = unicode.readUInt16BE(at)
      if (offset === 0) glyph = (code + delta) & 65535
      else {
        glyph = unicode.readUInt16BE(at + offset + 2 * (code - start))
        if (glyph) glyph = (glyph + delta) & 65535
      }
      break
    }
    if (glyph) {
      glyphs[code] = glyph
      const metric = Math.min(glyph, tables.hhea.readUInt16BE(34) - 1)
      advances[code] = tables.hmtx.readUInt16BE(metric * 4)
    }
  }
  return {
    ...FONT_PIN, static: true, names,
    unitsPerEm: tables.head.readUInt16BE(18),
    ascent: tables.hhea.readInt16BE(4), descent: tables.hhea.readInt16BE(6),
    glyphCount: tables.maxp.readUInt16BE(4), coverage: Object.keys(glyphs).map(Number), glyphs, advances
  }
}

export function assertSupportedText(layer, text, font) {
  assert(font && Object.entries(FONT_FACE).every(([key, value]) => font[key] === value), 'Unproven font capability')
  assert.equal(layer.fontFamily, FONT_FACE.family, 'Exact font family unavailable')
  assert.equal(layer.fontWeight ?? 400, FONT_FACE.weight, 'Exact font weight unavailable')
  assert(!layer.fontStyle || layer.fontStyle === 'normal', 'Unsupported font style')
  assert(typeof text === 'string' && text.length > 0 && text.length <= 4096, 'Invalid text length')
  assert(Number.isFinite(layer.fontSize) && layer.fontSize > 0 && layer.fontSize <= 512, 'Invalid font size')
  assert(text.length * layer.fontSize ** 2 <= 16_777_216, 'Text measurement exceeds resource budget')
  const coverage = new Set(font.coverage)
  for (const char of text) {
    const code = char.codePointAt(0)
    assert(permitted(code) && coverage.has(code), `Unsupported glyph U+${code.toString(16).toUpperCase()}`)
  }
}

export async function verifyFontInContainer(name, command = dockerCommand) {
  const actual = (await command(['exec', name, '/usr/bin/sha256sum', FONT_PIN.containerPath])).trim().split(/\s+/)[0]
  assert.equal(actual, FONT_PIN.sha256, 'Image font checksum mismatch')
  return actual
}

export async function loadFontRuntime(engine = 'photocraft', manifestPath = resolve(fontRuntimeRoot, 'runtime.json'), options = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(manifest.fontVersion, 'banner-linux-fonts-v1', 'Unsupported font runtime')
  assert.deepEqual(manifest.font, FONT_PIN, 'Font manifest mismatch')
  const fontBytes = await readFile(resolve(dirname(manifestPath), 'downloads', FONT_PIN.file))
  const font = inspectPinnedFont(fontBytes)
  assert.equal(sha256(await readFile(resolve(dirname(manifestPath), 'downloads/LICENSE.md'))), FONT_PIN.licenseSha256, 'Font license checksum mismatch')
  const runtime = await loadLinuxRuntime(engine, manifestPath, options)
  return Object.freeze({ ...runtime, font: Object.freeze({ ...font, coverage: Object.freeze(font.coverage), glyphs: Object.freeze(font.glyphs) }) })
}

/** Trusted local-only command adapter; not a hosted operation or untrusted argv API. */
export async function executeFontContainer(runtime, options) {
  assert(runtime.font?.sha256 === FONT_PIN.sha256, 'Font runtime required')
  assert(!options.beforeExecute, 'Font verification cannot be overridden')
  let actual
  const result = await executeLinuxContainer(runtime, {
    ...options,
    beforeExecute: async (name) => { actual = await verifyFontInContainer(name) }
  })
  return { ...result, fontSha256: actual, fontFace: FONT_FACE }
}
