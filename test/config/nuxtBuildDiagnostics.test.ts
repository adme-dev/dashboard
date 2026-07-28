import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return ['.ts', '.vue'].includes(extname(entry.name)) ? [path] : []
  })
}

describe('Nuxt preparation diagnostics', () => {
  it('keeps shared measurement auto-import names unique', () => {
    const sharedNames = ['PLATFORM_LABELS', 'PLATFORM_MODE_PREFIX', 'ProviderTestMode']
    const duplicates = sourceFiles('server/utils').flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return sharedNames
        .filter(name => new RegExp(`export\\s+(?:const|type|interface|class|function)\\s+${name}\\b`).test(source))
        .map(name => `${file}: ${name}`)
    })

    expect(duplicates).toEqual([])
  })

  it('only references icons present in the installed local collections', () => {
    const collections = Object.fromEntries(
      ['lucide', 'simple-icons'].map((collection) => {
        const data = JSON.parse(
          readFileSync(`node_modules/@iconify-json/${collection}/icons.json`, 'utf8')
        ) as { icons: Record<string, unknown>, aliases?: Record<string, unknown> }
        return [collection, new Set([...Object.keys(data.icons), ...Object.keys(data.aliases || {})])]
      })
    ) as Record<string, Set<string>>
    const missing = sourceFiles('app').flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(/["'`](?:i-)?(lucide|simple-icons)(?::|-)([a-z0-9-]+)["'`]/g)]
        .filter(match => !collections[match[1]]?.has(match[2]))
        .map(match => `${file}: ${match[1]}:${match[2]}`)
    })

    expect(missing).toEqual([])
  })
})
