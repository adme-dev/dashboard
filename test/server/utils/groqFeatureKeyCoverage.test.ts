import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = process.cwd()
const serverRoot = join(repoRoot, 'server')
const excludedFiles = new Set([
  'server/utils/groqClient.ts',
])

function listServerTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.nuxt' || entry.name === '.output') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listServerTsFiles(path))
    else if (entry.isFile() && path.endsWith('.ts')) out.push(path)
  }
  return out
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

describe('Groq Model Ops coverage', () => {
  it('keeps server-side generateGroqInsight call sites tagged with featureKey metadata', () => {
    const missing: string[] = []

    for (const file of listServerTsFiles(serverRoot)) {
      const rel = relative(repoRoot, file)
      if (excludedFiles.has(rel)) continue

      const source = readFileSync(file, 'utf8')
      let index = 0
      while ((index = source.indexOf('generateGroqInsight(', index)) !== -1) {
        const callWindow = source.slice(index, index + 1000)
        if (!callWindow.includes('featureKey')) {
          missing.push(`${rel}:${lineNumber(source, index)}`)
        }
        index += 'generateGroqInsight('.length
      }
    }

    expect(missing).toEqual([])
  })
})
