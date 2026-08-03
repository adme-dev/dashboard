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

  it('keeps mutations thin and transactional', () => {
    expect(read('index.post.ts')).toContain('transaction(db => createContentAsset')
    expect(read('[id]/versions.post.ts')).toContain('transaction(db => createContentVersion')
    expect(read('[id]/submit.post.ts')).toContain('transaction(db => submitContentVersion')
    expect(read('[id]/approve.post.ts')).toContain('transaction(db => approveContentVersion')
    expect(read('[id]/reject.post.ts')).toContain('transaction(db => rejectContentVersion')
  })
})
