import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../../../server/api/agency/search-authority/content/${path}`, import.meta.url), 'utf8')

describe('Search Authority content workflow routes', () => {
  it('gates every content route by tenant access', () => {
    for (const path of [
      'index.get.ts', 'index.post.ts', '[id].get.ts', '[id]/versions.post.ts',
      '[id]/submit.post.ts', '[id]/approve.post.ts', '[id]/reject.post.ts'
    ]) expect(read(path)).toContain('requireAgencySearchAuthorityAccess')
  })

  it('keeps mutations thin and runs them through the God-mode-aware transaction boundary', () => {
    // Owners run under the execution ledger; executeSearchAuthorityMutation falls back to a plain
    // transaction for staff. A bare transaction() here would 503 for owners.
    expect(read('index.post.ts')).toContain('executeSearchAuthorityMutation(event, \'asset-create\'')
    expect(read('index.post.ts')).toContain('db => createContentAsset')
    expect(read('[id]/versions.post.ts')).toContain('executeSearchAuthorityMutation(event, \'version-create\'')
    expect(read('[id]/versions.post.ts')).toContain('db => createContentVersion')
    expect(read('[id]/submit.post.ts')).toContain('executeSearchAuthorityMutation(event, \'version-submit\'')
    expect(read('[id]/submit.post.ts')).toContain('await submitContentVersion(db')
    expect(read('[id]/approve.post.ts')).toContain('executeSearchAuthorityMutation(event, \'version-approve\'')
    expect(read('[id]/approve.post.ts')).toContain('await approveContentVersion(db')
    expect(read('[id]/reject.post.ts')).toContain('executeSearchAuthorityMutation(event, \'version-reject\'')
    expect(read('[id]/reject.post.ts')).toContain('await rejectContentVersion(db')
    for (const path of ['index.post.ts', '[id]/versions.post.ts', '[id]/submit.post.ts', '[id]/approve.post.ts', '[id]/reject.post.ts']) {
      expect(read(path)).not.toMatch(/\btransaction\s*\(/)
    }
  })

  it('authorizes the supplied tenant before reading a content asset', () => {
    for (const path of [
      '[id].get.ts', '[id]/versions.post.ts', '[id]/submit.post.ts',
      '[id]/approve.post.ts', '[id]/reject.post.ts'
    ]) {
      expect(read(path)).toMatch(/await requireAgencySearchAuthorityAccess[\s\S]+await queryOne/)
      expect(read(path)).toMatch(/WHERE id = \$1 AND client_id = \$2/)
    }
  })
})
