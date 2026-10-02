import { describe, expect, it, vi } from 'vitest'
const connections = vi.hoisted(() => [] as Array<{ config: { connectionString: string }, connect: ReturnType<typeof vi.fn>, query: ReturnType<typeof vi.fn>, end: ReturnType<typeof vi.fn> }>)
vi.mock('pg', () => ({ default: { Client: class {
  connect = vi.fn().mockResolvedValue(undefined)
  query = vi.fn().mockResolvedValue({ rows: [] })
  end = vi.fn().mockResolvedValue(undefined)
  constructor(public config: { connectionString: string }) { connections.push(this) }
} } }))
import { dbGetVideoGenerationJob, withVideoGenerationDatabase } from '../../workers/video-generation/src/db'

describe('video worker database ownership', () => {
  it('isolates concurrent invocations and closes each query client', async () => {
    connections.length = 0
    await Promise.all([
      withVideoGenerationDatabase('connection-a', async () => { await dbGetVideoGenerationJob('a1'); await dbGetVideoGenerationJob('a2') }),
      withVideoGenerationDatabase('connection-b', async () => { await dbGetVideoGenerationJob('b1') })
    ])
    expect(connections.map(c => c.config.connectionString).sort()).toEqual(['connection-a', 'connection-a', 'connection-b'])
    for (const client of connections) expect(client.end).toHaveBeenCalledOnce()
  })
  it('cannot access a connection outside its invocation scope', async () => {
    await expect(dbGetVideoGenerationJob('outside')).rejects.toThrow('database context unavailable')
  })
})
