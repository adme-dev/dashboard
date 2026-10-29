import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import'

function sizePackage(size: string, sha: string) {
  return {
    kind: 'xeroflow-thebrief-import', version: 1, name: 'Hunter',
    source: { designHash: size, sha256: sha, folder: 'Northern JAC', duration: 8, loopCount: 0 },
    canvasData: { [`custom_${size}`]: { playback: { duration: 8, loopCount: 0 }, layers: [{
      id: 1, type: 'text', name: 'Offer', linkId: 'source:offer', text: 'Drive away',
      x: 10, y: 20, w: 200, h: 50, zIndex: 1, opacity: 1,
      animIn: 'none', animInDur: 0, startTime: 0, endTime: 8,
    }] } }, warnings: [], assets: [], fonts: [],
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
        cwd: resolve('.'), env: { ...process.env, TSX_TSCONFIG_PATH: 'scripts/thebrief/tsconfig.json' }, timeout: 10000,
      })
      const result = parseTheBriefPackage(JSON.parse(readFileSync(output, 'utf8')))
      expect(Object.keys(result.canvasData)).toEqual(['custom_1200x1200', 'custom_1080x1920'])
      expect(result.source.designHash).toBe('1nz5y6q')
      expect(result.source.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(result.source.sha256).not.toBe(createHash('sha256').update('a'.repeat(64)).digest('hex'))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
