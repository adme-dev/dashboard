import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Walk with node:fs rather than shelling out to `rg`. ripgrep is not installed
 * on the GitHub runner, so the previous execFileSync made this test pass only
 * on machines that happened to have it — it threw ENOENT in CI.
 */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(full) : [full]
  })
}

describe('HR route authentication inventory', () => {
  it('keeps an explicit authentication boundary on every HR endpoint', () => {
    const files = listFiles('server/api/agency/hr')
      .filter(file => /\.(get|post|put|patch|delete)\.ts$/.test(file))
    expect(files.length).toBeGreaterThan(30)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} must authenticate explicitly`).toMatch(/requireHrAdmin\(event\)|requireAuth\(event\)/)
    }
  })
})
