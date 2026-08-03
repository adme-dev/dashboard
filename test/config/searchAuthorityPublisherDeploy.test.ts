import { readFileSync } from 'node:fs'
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
})
