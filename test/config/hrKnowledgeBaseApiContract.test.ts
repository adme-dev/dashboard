import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const routes = [
  '../../server/api/agency/hr/knowledge/index.get.ts',
  '../../server/api/agency/hr/knowledge/index.post.ts',
  '../../server/api/agency/hr/knowledge/[id]/versions.post.ts',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8'))

describe('governed HR knowledge API', () => {
  it('authorizes before data access, disables caching, validates writes, and audits mutations', () => {
    for (const route of routes) {
      expect(route).toContain('requireHrAdmin(event)')
      expect(route).toContain("'Cache-Control', 'private, no-store'")
    }
    expect(routes[1]).toContain('hrKnowledgeEntrySchema.safeParse')
    expect(routes[2]).toContain('hrKnowledgeRevisionSchema.safeParse')
    expect(routes[1]).toContain("action: 'hr_knowledge.created'")
    expect(routes[2]).toContain("action: input.status === 'approved' ? 'hr_knowledge.approved' : 'hr_knowledge.revised'")
    expect(routes[2]).toContain("status = 'approved' ORDER BY version DESC LIMIT 1")
    expect(routes[2]).toContain('current.approved_version_id')
  })

  it('never writes governed content to general knowledge or AI memory', () => {
    const source = routes.join('\n')
    expect(source).not.toMatch(/ai_memor|knowledge_documents|upsertVector|generateEmbedding/i)
    expect(source).toContain('general_ai_excluded')
  })
})
