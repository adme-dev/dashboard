import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

describe('HR route authentication inventory', () => {
  it('keeps an explicit authentication boundary on every HR endpoint', () => {
    const files = execFileSync('rg', ['--files', 'server/api/agency/hr'], { encoding: 'utf8' })
      .trim().split('\n').filter(file => /\.(get|post|put|patch|delete)\.ts$/.test(file))
    expect(files.length).toBeGreaterThan(30)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} must authenticate explicitly`).toMatch(/requireHrAdmin\(event\)|requireAuth\(event\)/)
    }
  })
})
