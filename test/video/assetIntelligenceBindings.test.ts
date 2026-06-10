import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

type TomlValue = string | number | boolean | TomlValue[] | TomlObject | TomlObject[]
type TomlObject = { [key: string]: TomlValue }

function stripTomlComment(line: string): string {
  let quoted = false
  let escaped = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && quoted) {
      escaped = true
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === '#' && !quoted) {
      return line.slice(0, i).trim()
    }
  }
  return line.trim()
}

function parseTomlValue(raw: string): TomlValue {
  const value = raw.trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"')
  }
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+$/.test(value)) return Number(value)
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map(item => parseTomlValue(item.trim()))
  }
  throw new Error(`Unsupported TOML value in test parser: ${raw}`)
}

function objectAt(rootObject: TomlObject, path: string[]): TomlObject {
  let cursor = rootObject
  for (const key of path) {
    const existing = cursor[key]
    if (existing === undefined) {
      const next: TomlObject = {}
      cursor[key] = next
      cursor = next
      continue
    }
    if (typeof existing !== 'object' || Array.isArray(existing)) {
      throw new Error(`TOML path ${path.join('.')} conflicts at ${key}`)
    }
    cursor = existing as TomlObject
  }
  return cursor
}

function parseTomlSubset(config: string): TomlObject {
  const parsed: TomlObject = {}
  let current = parsed

  for (const rawLine of config.split('\n')) {
    const line = stripTomlComment(rawLine)
    if (!line) continue

    const arrayTable = line.match(/^\[\[([A-Za-z0-9_.-]+)\]\]$/)
    if (arrayTable) {
      const path = arrayTable[1].split('.')
      const parent = objectAt(parsed, path.slice(0, -1))
      const key = path[path.length - 1]
      const table = parent[key] ?? []
      if (!Array.isArray(table)) throw new Error(`TOML table ${arrayTable[1]} is not an array`)
      const item: TomlObject = {}
      table.push(item)
      parent[key] = table
      current = item
      continue
    }

    const table = line.match(/^\[([A-Za-z0-9_.-]+)\]$/)
    if (table) {
      current = objectAt(parsed, table[1].split('.'))
      continue
    }

    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/)
    if (!assignment) throw new Error(`Unsupported TOML line in test parser: ${rawLine}`)
    current[assignment[1]] = parseTomlValue(assignment[2])
  }

  return parsed
}

function tomlArray(config: TomlObject, path: string): TomlObject[] {
  const value = path.split('.').reduce<TomlValue | undefined>((cursor, key) => {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
    return (cursor as TomlObject)[key]
  }, config)

  if (!Array.isArray(value)) throw new Error(`Expected TOML array at ${path}`)
  return value as TomlObject[]
}

describe('asset intelligence production bindings', () => {
  it('documents the Pages producer and standalone consumer deployment wiring', () => {
    const docs = readFileSync(resolve(root, 'docs/ENVIRONMENT_VARIABLES.md'), 'utf8')
    const deployment = readFileSync(resolve(root, 'workers/asset-intelligence/DEPLOYMENT.md'), 'utf8')

    expect(docs).toContain('Video Asset Intelligence')
    expect(docs).toContain('ASSET_INTELLIGENCE_QUEUE')
    expect(docs).toContain('xeroflow-asset-intelligence')
    expect(docs).toContain('asset-intelligence')
    expect(docs).toContain('asset-intelligence-dlq')
    expect(docs).toContain('HYPERDRIVE')
    expect(docs).toContain('DATABASE_URL')
    expect(docs).toContain('MEDIA_BUCKET')
    expect(docs).toContain('AI')
    expect(docs).toContain('178_video_derivative_bucket_item_unique_index.sql')
    expect(docs).toContain('workers/asset-intelligence/DEPLOYMENT.md')

    expect(deployment).toContain('pnpm exec wrangler queues create asset-intelligence')
    expect(deployment).toContain('pnpm exec wrangler queues create asset-intelligence-dlq')
    expect(deployment).toContain('178_video_derivative_bucket_item_unique_index.sql')
    expect(deployment).toContain('pnpm --dir workers/asset-intelligence deploy')
    expect(deployment).toContain('pnpm deploy:production')
    expect(deployment).toContain('Smoke test extraction')
  })

  it('declares the Pages producer binding for asset intelligence jobs', () => {
    const rootWrangler = parseTomlSubset(readFileSync(resolve(root, 'wrangler.toml'), 'utf8'))

    const producer = tomlArray(rootWrangler, 'queues.producers')
      .find(item => item.binding === 'ASSET_INTELLIGENCE_QUEUE')
    expect(producer).toEqual({
      binding: 'ASSET_INTELLIGENCE_QUEUE',
      queue: 'asset-intelligence',
    })
  })

  it('declares the standalone asset intelligence worker bindings', () => {
    const workerWrangler = parseTomlSubset(readFileSync(resolve(root, 'workers/asset-intelligence/wrangler.toml'), 'utf8'))

    expect(workerWrangler.name).toBe('xeroflow-asset-intelligence')

    expect(tomlArray(workerWrangler, 'queues.consumers')).toEqual([
      {
        queue: 'asset-intelligence',
        max_batch_size: 1,
        max_batch_timeout: 5,
        max_retries: 2,
        dead_letter_queue: 'asset-intelligence-dlq',
      },
    ])

    expect(tomlArray(workerWrangler, 'r2_buckets')).toEqual([
      {
        binding: 'MEDIA_BUCKET',
        bucket_name: 'agency-files',
      },
    ])

    expect(tomlArray(workerWrangler, 'hyperdrive')).toEqual([
      {
        binding: 'HYPERDRIVE',
        id: '900b4b74ec41462cbbabebd0aa8775aa',
      },
    ])

    expect(workerWrangler.ai).toEqual({ binding: 'AI' })
  })
})
