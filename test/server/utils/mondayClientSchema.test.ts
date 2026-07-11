import { beforeEach, describe, expect, it, vi } from 'vitest'

const ofetchMock = vi.fn()

vi.mock('ofetch', () => ({
  ofetch: ofetchMock,
}))

describe('MondayClient GraphQL schema compatibility', () => {
  beforeEach(() => {
    ofetchMock.mockReset()
    ofetchMock.mockResolvedValue({ data: { boards: [] } })
  })

  it('requests the supported column settings_str field', async () => {
    const { MondayClient } = await import('~~/server/utils/mondayClient')
    const client = new MondayClient('test-token')

    await client.getBoard('board-1')

    const options = ofetchMock.mock.calls[0]?.[1]
    expect(options?.headers?.['API-Version']).toBe('2025-04')
    expect(options?.body?.query).toMatch(/columns\s*{[\s\S]*settings_str[\s\S]*}/)
    expect(options?.body?.query).not.toMatch(/\n\s+settings\s*\n/)
  })

  it('requests the canonical Monday URL for items and subitems', async () => {
    const { MondayClient } = await import('~~/server/utils/mondayClient')
    const client = new MondayClient('test-token')

    ofetchMock
      .mockResolvedValueOnce({ data: { boards: [{ items_page: { cursor: null, items: [] } }] } })
      .mockResolvedValueOnce({ data: { next_items_page: { cursor: null, items: [] } } })
      .mockResolvedValueOnce({ data: { items: [{ subitems: [] }] } })

    await client.getItems('board-1')
    await client.getItems('board-1', { cursor: 'next-page' })
    await client.getSubitems('item-1')

    for (const call of ofetchMock.mock.calls.slice(-3)) {
      expect(call[1]?.body?.query).toMatch(/\n\s+url\s*\n/)
    }
  })

  it('uses the current board object on subitems and normalizes board_id', async () => {
    const { MondayClient } = await import('~~/server/utils/mondayClient')
    const client = new MondayClient('test-token')
    ofetchMock.mockResolvedValueOnce({
      data: { items: [{ subitems: [{ id: 'sub-1', name: 'Subitem', board: { id: 'board-2' } }] }] }
    })

    const subitems = await client.getSubitems('item-1')
    const query = ofetchMock.mock.calls[0]?.[1]?.body?.query

    expect(query).toMatch(/board\s*{\s*id\s*}/)
    expect(query).not.toMatch(/\n\s+board_id\s*\n/)
    expect(subitems[0]?.board_id).toBe('board-2')
  })
})
