import { describe, expect, it, vi } from 'vitest'
import { resolveActiveBoardId, type ToolContext } from '~~/server/utils/ai/toolContext'
import { searchKnowledge, type KnowledgeDeps } from '~~/server/utils/ai/tools/knowledge'

const ACTIVE_BOARD_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_BOARD_ID = '22222222-2222-4222-8222-222222222222'

function context(activeBoardId?: string): ToolContext {
  return {
    userId: 'user-1',
    userRole: 'producer',
    event: {
      context: {
        cloudflare: { env: { BOARD_KNOWLEDGE_SEARCH_ENABLED: 'true' } }
      }
    } as never,
    activeBoardId,
    assistantScope: {
      departmentIds: [ACTIVE_BOARD_ID],
      clientAccessMode: 'assigned',
      assignedClientIds: [],
      catalogReleaseIds: []
    }
  }
}

describe('Board Knowledge tool scope and citations', () => {
  it('canonicalises an active board only when it is in server-derived scope', () => {
    const scope = context().assistantScope
    expect(resolveActiveBoardId(ACTIVE_BOARD_ID, scope)).toBe(ACTIVE_BOARD_ID)
    expect(resolveActiveBoardId(OTHER_BOARD_ID, scope)).toBeUndefined()
    expect(resolveActiveBoardId('not-a-uuid', scope)).toBeUndefined()
    expect(resolveActiveBoardId(ACTIVE_BOARD_ID.toUpperCase(), scope)).toBe(ACTIVE_BOARD_ID)
  })

  it('passes only server-derived board scope and returns a safe structured citation', async () => {
    const boardSearch = vi.fn().mockResolvedValue({
      items: [{
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        articleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        boardId: ACTIVE_BOARD_ID,
        scopeKey: `board:${ACTIVE_BOARD_ID}`,
        title: 'Cashflow work instruction',
        snippet: 'Enter approved supplier bills before Friday.',
        score: 0.91,
        sourceFileName: 'Cashflow work instruction.pdf',
        boardName: 'Finance',
        pageStart: 3,
        pageEnd: 4,
        sheetName: null,
        slideNumber: null,
        url: `/agency/boards/${ACTIVE_BOARD_ID}`,
        storageKey: 'must-not-leak'
      }]
    })
    const deps: KnowledgeDeps = {
      search: vi.fn(),
      canSee: () => true,
      boardSearch
    }

    const response = await searchKnowledge({ query: 'when are bills paid?', limit: 5 }, context(ACTIVE_BOARD_ID), deps)

    expect(boardSearch).toHaveBeenCalledWith('when are bills paid?', expect.objectContaining({
      departmentIds: [ACTIVE_BOARD_ID],
      activeBoardId: ACTIVE_BOARD_ID,
      limit: 5
    }))
    expect(deps.search).not.toHaveBeenCalled()
    expect(response).toEqual({
      ok: true,
      data: {
        items: [{
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          title: 'Cashflow work instruction',
          snippet: 'Enter approved supplier bills before Friday.',
          score: 0.91,
          source: {
            fileName: 'Cashflow work instruction.pdf',
            boardName: 'Finance',
            pageStart: 3,
            pageEnd: 4,
            sheetName: null,
            slideNumber: null,
            url: `/agency/boards/${ACTIVE_BOARD_ID}`
          }
        }],
        more: 0
      }
    })
    expect(JSON.stringify(response)).not.toContain('must-not-leak')
  })

  it('falls back to the legacy agency search while the feature flag is disabled', async () => {
    const ctx = context(ACTIVE_BOARD_ID)
    const eventContext = ctx.event.context as unknown as {
      cloudflare: { env: { BOARD_KNOWLEDGE_SEARCH_ENABLED: string } }
    }
    eventContext.cloudflare.env.BOARD_KNOWLEDGE_SEARCH_ENABLED = 'false'
    const deps: KnowledgeDeps = {
      search: vi.fn().mockResolvedValue([{ id: 'legacy', score: 0.8, metadata: { title: 'Agency SOP', text: 'Legacy text' } }]),
      canSee: () => true,
      boardSearch: vi.fn()
    }

    const response = await searchKnowledge({ query: 'SOP', limit: 5 }, ctx, deps)
    expect(deps.boardSearch).not.toHaveBeenCalled()
    expect(deps.search).toHaveBeenCalledOnce()
    expect(response.ok).toBe(true)
    if (!response.ok) throw new Error(response.error)
    const data = response.data as { items: Array<Record<string, unknown>> }
    expect(data.items[0]).toEqual({
      id: 'legacy', title: 'Agency SOP', snippet: 'Legacy text', score: 0.8
    })
  })
})
