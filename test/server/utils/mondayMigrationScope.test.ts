import { describe, expect, it, vi } from 'vitest'
import { resolveMigrationBoards, type MigrationConfig } from '~~/server/utils/mondayMigration'

const baseConfig: MigrationConfig = {
  skipArchivedBoards: true,
  skipCompletedItems: false,
  importUpdates: false,
  importFiles: false,
  importSubitems: true,
}

describe('resolveMigrationBoards', () => {
  it('fetches only explicitly mapped boards when mappings are supplied', async () => {
    const getBoard = vi.fn(async (id: string) => ({ id, name: `Board ${id}`, type: 'board', state: 'active' as const }))
    const getBoards = vi.fn()

    const boards = await resolveMigrationBoards({ getBoard, getBoards } as any, {
      ...baseConfig,
      boardMappings: [{ mondayBoardId: 'approved-board', departmentId: 'department-1' }],
    })

    expect(getBoard).toHaveBeenCalledWith('approved-board')
    expect(getBoards).not.toHaveBeenCalled()
    expect(boards.map(board => board.id)).toEqual(['approved-board'])
  })

  it('uses account-wide discovery only when no mappings are supplied', async () => {
    const getBoard = vi.fn()
    const getBoards = vi.fn(async () => [])

    await resolveMigrationBoards({ getBoard, getBoards } as any, baseConfig)

    expect(getBoard).not.toHaveBeenCalled()
    expect(getBoards).toHaveBeenCalledWith({ state: 'active', limit: 500 })
  })
})
