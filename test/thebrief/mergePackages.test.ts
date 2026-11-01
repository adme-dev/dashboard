import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { TheBriefPackage } from '../../app/utils/thebrief-import'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import'

function sizePackage(size: string, sha: string): TheBriefPackage {
  return {
    kind: 'xeroflow-thebrief-import', version: 1, name: 'Hunter',
    source: { designHash: size, sha256: sha, folder: 'Northern JAC', duration: 8, loopCount: 0 },
    canvasData: { [`custom_${size}`]: { playback: { duration: 8, loopCount: 0 }, layers: [{
      id: 1, type: 'text', name: 'Offer', linkId: 'source:offer', text: 'Drive away',
      x: 10, y: 20, w: 200, h: 50, zIndex: 1, opacity: 1,
      animIn: 'none', animInDur: 0, startTime: 0, endTime: 8
    }] } }, warnings: [], assets: [], fonts: []
  }
}

describe('TheBrief design set packaging', () => {
  it('merges verified sizes under one source identity', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thebrief-merge-'))
    try {
      const first = join(dir, 'square.json'), second = join(dir, 'story.json'), output = join(dir, 'set.json')
      writeFileSync(first, JSON.stringify(sizePackage('1200x1200', 'a'.repeat(64))))
      writeFileSync(second, JSON.stringify(sizePackage('1080x1920', 'b'.repeat(64))))
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/thebrief/merge-packages.mjs', '1nz5y6q', 'Hunter set', output, first, second], {
        cwd: resolve('.'), env: { ...process.env, TSX_TSCONFIG_PATH: 'scripts/thebrief/tsconfig.json' }, timeout: 10000
      })
      const result = parseTheBriefPackage(JSON.parse(readFileSync(output, 'utf8')))
      expect(Object.keys(result.canvasData)).toEqual(['custom_1200x1200', 'custom_1080x1920'])
      expect(result.source.designHash).toBe('1nz5y6q')
      expect(result.source.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(result.source.sha256).not.toBe(createHash('sha256').update('a'.repeat(64)).digest('hex'))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

it('deduplicates identical font bytes and remaps every size to the retained alias', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thebrief-font-merge-'))
  try {
    const paths = ['1200x1200', '1080x1920'].map((size, index) => {
      const pkg = sizePackage(size, String(index + 1).repeat(64))
      const family = `Campaign XF source${index}`
      pkg.canvasData[`custom_${size}`].layers[0].fontFamily = family
      pkg.fonts = [{ path: './fonts/campaign.ttf', fileName: 'campaign.ttf', family, weight: 400, style: 'normal', format: 'truetype', mimeType: 'font/ttf', sha256: 'a'.repeat(64), base64: 'YQ==' }]
      const file = join(dir, `${index}.json`)
      writeFileSync(file, JSON.stringify(pkg))
      return file
    })
    const output = join(dir, 'set.json')
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/thebrief/merge-packages.mjs', 'campaign', 'Campaign set', output, ...paths], {
      cwd: resolve('.'), env: { ...process.env, TSX_TSCONFIG_PATH: 'scripts/thebrief/tsconfig.json' }, timeout: 10000
    })
    const merged = parseTheBriefPackage(JSON.parse(readFileSync(output, 'utf8')))
    expect(merged.fonts).toHaveLength(1)
    expect(merged.fonts[0]?.family).toBe('Campaign XF source0')
    for (const board of Object.values(merged.canvasData)) expect(board.layers[0]?.fontFamily).toBe(merged.fonts[0]?.family)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it('retains a size-specific font weight when another weight shares bytes across sizes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thebrief-weight-merge-'))
  try {
    const paths = ['1200x1200', '1080x1920'].map((size, index) => {
      const pkg = sizePackage(size, String(index + 1).repeat(64))
      const family = `Avenir XF source${index}`
      const regular = { path: './fonts/regular.ttf', fileName: 'regular.ttf', family, weight: 400, style: 'normal' as const, format: 'truetype' as const, mimeType: 'font/ttf' as const, sha256: 'a'.repeat(64), base64: 'YQ==' }
      pkg.fonts = [regular]
      Object.assign(pkg.canvasData[`custom_${size}`].layers[0]!, { fontFamily: family, fontWeight: 400 })
      if (index) {
        pkg.fonts.push({ ...regular, path: './fonts/light.ttf', fileName: 'light.ttf', weight: 300, sha256: 'b'.repeat(64), base64: 'Yg==' })
        pkg.canvasData[`custom_${size}`].layers.push({ ...pkg.canvasData[`custom_${size}`].layers[0]!, id: 2, linkId: 'source:light', fontWeight: 300 })
      }
      const file = join(dir, `${index}.json`)
      writeFileSync(file, JSON.stringify(pkg))
      return file
    })
    const output = join(dir, 'set.json')
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/thebrief/merge-packages.mjs', 'campaign', 'Campaign set', output, ...paths], {
      cwd: resolve('.'), env: { ...process.env, TSX_TSCONFIG_PATH: 'scripts/thebrief/tsconfig.json' }, timeout: 10000
    })
    const merged = parseTheBriefPackage(JSON.parse(readFileSync(output, 'utf8')))
    expect(merged.fonts).toHaveLength(2)
    const story = merged.canvasData.custom_1080x1920.layers
    expect(story[0]).toMatchObject({ fontFamily: 'Avenir XF source0', fontWeight: 400 })
    expect(story[1]).toMatchObject({ fontFamily: 'Avenir XF source1', fontWeight: 300 })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
