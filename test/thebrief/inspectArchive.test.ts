import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectArchive } from '../../scripts/thebrief/inspect-archive.mjs'

const html = '<meta name="ad.size" content="width=300,height=250"><style>@keyframes reveal {from {opacity:0} to {opacity:1}}</style><script>window.DO_NOT_RUN = true</script>'
const zip = (files: Record<string, string | Uint8Array>) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, body]) => [name, typeof body === 'string' ? strToU8(body) : body]))))

describe('TheBrief export preflight (no script execution)', () => {
  it('reports dimensions, hashes, animation signals and an unverified timeline honestly', () => {
    const report = inspectArchive(zip({ 'creative/index.html': html, 'creative/logo.svg': '<svg/>' }))
    expect(report.creatives[0]).toMatchObject({ entry: 'creative/index.html', dimensions: { width: 300, height: 250 }, timelineStatus: 'requires-adapter', animationSignals: ['css-keyframes'] })
    expect(report.files).toHaveLength(2)
    expect(report.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(globalThis).not.toHaveProperty('DO_NOT_RUN')
  })

  it('keeps same-size creatives separate in a nested design set', () => {
    const report = inspectArchive(zip({ 'one.zip': zip({ 'index.html': html }), 'two.zip': zip({ 'index.html': html }) }))
    expect(report.creatives.map(c => c.entry)).toEqual(['one.zip!/index.html', 'two.zip!/index.html'])
  })

  it.each(['../escape.html', '/absolute.html', 'a/../escape.html', 'a\\escape.html', 'C:/escape.html'])('rejects unsafe entry %s', (name) => {
    expect(() => inspectArchive(zip({ [name]: html }))).toThrow(/path/i)
  })

  it('rejects ambiguous case-insensitive paths', () => {
    expect(() => inspectArchive(zip({ 'Index.html': html, 'index.html': html }))).toThrow(/duplicate/i)
  })

  it('limits actual inflated bytes even when the directory lies', () => {
    const data = zip({ 'index.html': 'A'.repeat(100000) })
    const directory = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    data.writeUInt32LE(1, directory + 24)
    expect(() => inspectArchive(data, { maxFileBytes: 4096 })).toThrow()
  })

  it('rejects encrypted, symlink and truncated archives', () => {
    const encrypted = zip({ 'index.html': html })
    const directory = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    encrypted.writeUInt16LE(encrypted.readUInt16LE(directory + 8) | 1, directory + 8)
    expect(() => inspectArchive(encrypted)).toThrow(/encrypt/i)
    const link = zip({ 'index.html': html })
    link.writeUInt32LE((0xa1ff << 16) >>> 0, directory + 38)
    expect(() => inspectArchive(link)).toThrow(/symlink/i)
    expect(() => inspectArchive(link.subarray(0, 20))).toThrow(/ZIP/i)
  })

  it('enforces shared limits across nested archives', () => {
    expect(() => inspectArchive(zip({ 'a.zip': zip({ 'index.html': html }), 'b.zip': zip({ 'index.html': html }) }), { maxFiles: 3 })).toThrow(/file count/i)
    expect(() => inspectArchive(zip({ 'a.zip': zip({ 'b.zip': zip({ 'index.html': html }) }) }))).toThrow(/nesting/i)
  })

  it('reports external-resource hints without fetching URLs or claiming completeness', () => {
    const report = inspectArchive(zip({ 'index.html': '<script src="https://example.com/runtime.js"></script>' }))
    expect(report.resourceHints).toContainEqual({ file: 'index.html', url: 'https://example.com/runtime.js' })
    expect(report.limitations.join(' ')).toMatch(/static scan/i)
  })

  it('detects corruption and mismatched local filenames', () => {
    const corrupt = zip({ 'index.html': html })
    const directory = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    corrupt.writeUInt32LE(0, directory + 16)
    expect(() => inspectArchive(corrupt)).toThrow(/checksum/i)
    const conflict = zip({ 'index.html': html })
    conflict[30] = 'x'.charCodeAt(0)
    expect(() => inspectArchive(conflict)).toThrow(/path/i)
  })

  it('runs the real command against a ZIP and emits usable JSON', () => {
    const directory = mkdtempSync(join(tmpdir(), 'thebrief-inspect-test-'))
    try {
      const filename = join(directory, 'banner.zip')
      writeFileSync(filename, zip({ 'index.html': html }))
      const output = execFileSync(process.execPath, ['scripts/thebrief/inspect.mjs', filename], { encoding: 'utf8' })
      expect(JSON.parse(output).creatives[0].dimensions).toEqual({ width: 300, height: 250 })
      expect(() => execFileSync(process.execPath, ['scripts/thebrief/inspect.mjs', join(directory, 'missing.zip')], { stdio: 'pipe' })).toThrow()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
