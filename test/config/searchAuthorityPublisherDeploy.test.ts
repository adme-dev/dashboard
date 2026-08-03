import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const wrapper = () => readFileSync('scripts/deploy-search-authority-publisher.mjs', 'utf8')
const workerConfig = () => readFileSync('workers/search-authority-publisher/wrangler.jsonc', 'utf8')
const rootConfig = () => readFileSync('wrangler.toml', 'utf8')
const pkg = () => JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }

describe('Search Authority publisher deployment guard', () => {
  it('pins the standalone Worker and shared private R2 bucket', () => {
    expect(workerConfig()).toContain('"name": "search-authority-publisher"')
    expect(workerConfig()).toContain('"binding": "PUBLICATIONS"')
    expect(rootConfig()).toMatch(/binding = "SEARCH_AUTHORITY_BUCKET"[\s\S]*bucket_name = "agency-search-authority-publications"/)
  })

  it('runs verification through a fail-closed named wrapper', () => {
    expect(wrapper()).toContain('const IMMUTABLE_WORKER_NAME = \'search-authority-publisher\'')
    expect(wrapper()).toContain('searchAuthorityPublicationRenderer.test.ts')
    expect(wrapper()).toContain('deploy:dry-run')
    expect(pkg().scripts['deploy:search-authority-publisher']).toContain('deploy-search-authority-publisher.mjs')
    expect(pkg().scripts['deploy:search-authority-publisher:dry-run']).toContain('--dry-run')
  })

  it('invokes the publisher package deploy script instead of pnpm deploy', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'search-authority-publisher-deploy-'))
    const callsPath = join(sandbox, 'calls.jsonl')
    const fakePnpmPath = join(sandbox, 'pnpm')

    writeFileSync(fakePnpmPath, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
appendFileSync(process.env.PUBLISHER_DEPLOY_CALLS, JSON.stringify(process.argv.slice(2)) + '\\n')
`)
    chmodSync(fakePnpmPath, 0o755)

    try {
      const result = spawnSync(process.execPath, ['scripts/deploy-search-authority-publisher.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${sandbox}${delimiter}${process.env.PATH ?? ''}`,
          PUBLISHER_DEPLOY_CALLS: callsPath
        }
      })

      expect(result.status, result.stderr).toBe(0)
      const calls = readFileSync(callsPath, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as string[])

      expect(calls.at(-1)).toEqual([
        '--dir',
        'workers/search-authority-publisher',
        'run',
        'deploy'
      ])
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })
})
