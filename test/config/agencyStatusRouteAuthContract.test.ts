import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = (path: string) => readFileSync(
  new URL(`../../server/api/agency/${path}`, import.meta.url),
  'utf8'
)

describe('agency status route authorization contract', () => {
  it('authenticates status reads', () => {
    expect(route('statuses/index.get.ts')).toContain('await requireAuth(event)')
  })

  it('requires write and board access for status creation and updates', () => {
    for (const path of ['statuses/index.post.ts', 'statuses/[id].put.ts']) {
      const source = route(path)
      expect(source).toContain('await requireWriteAccess(event)')
      expect(source).toContain('await requireBoardAccess(')
    }
  })

  it('authorizes every board represented in a reorder request', () => {
    const source = route('statuses/reorder.patch.ts')
    expect(source).toContain('await requireWriteAccess(event)')
    expect(source).toContain('await requireBoardAccess(')
    expect(source).toContain('SELECT id, department_id')
  })

  it('uses authenticated write and board access for task status changes', () => {
    const source = route('tasks/[id]/status.patch.ts')
    expect(source).toContain('await requireWriteAccess(event)')
    expect(source).toContain('await requireBoardAccess(')
    expect(source).not.toContain('body.userId')
  })
})
