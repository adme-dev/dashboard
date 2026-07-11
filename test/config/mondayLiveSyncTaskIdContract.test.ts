import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../../server/utils/mondaySync.ts', import.meta.url), 'utf8')

describe('Monday live sync task identity contract', () => {
  it('captures the persisted task id only after update or insert resolution', () => {
    const declaration = source.indexOf('let taskId: string')
    const insertedId = source.indexOf('taskId = inserted.rows[0].id')
    const capturedId = source.indexOf('syncedTaskId = taskId')

    expect(declaration).toBeGreaterThan(-1)
    expect(insertedId).toBeGreaterThan(declaration)
    expect(capturedId).toBeGreaterThan(insertedId)
  })

  it('uses the captured persisted id for file synchronization', () => {
    expect(source).toContain('if (options.syncFiles && syncedTaskId)')
    expect(source).toContain("await syncMondayFiles(client, String(item.id), syncedTaskId)")
  })
})
