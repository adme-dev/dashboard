import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const { default: deliverablesHandler } = await import(
  '../../../../server/api/portal/deliverables/index.get'
)

describe('portal deliverables list API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({ id: 'client-user-1', clientId: 'client-1' })
    mockQueryRows.mockResolvedValue([
      {
        id: 'deliverable-1',
        title: 'Campaign Creative',
        description: null,
        deliverable_type: 'image',
        file_url: 'https://cdn.example.com/file.png',
        file_name: 'file.png',
        file_type: 'image/png',
        file_size: '1024',
        thumbnail_url: 'https://cdn.example.com/thumb.png',
        preview_url: null,
        metadata: {},
        tags: ['creative'],
        status: 'published',
        is_featured: true,
        is_final: true,
        version: 1,
        published_at: '2026-05-28T00:00:00Z',
        approved_at: '2026-05-27T00:00:00Z',
        view_count: '10',
        download_count: '3',
        created_at: '2026-05-27T00:00:00Z',
        updated_at: '2026-05-28T00:00:00Z',
        project_id: 'project-1',
        project_name: 'Launch',
        created_by_name: 'Agency User'
      }
    ])
    mockQueryOne
      .mockResolvedValueOnce({ count: '1' })
      .mockResolvedValueOnce({
        total: '6',
        featured: '2',
        final: '4',
        recent: '3',
        approved: '1',
        published: '4',
        draft: '1',
        image: '2',
        video: '1',
        document: '1',
        design: '1',
        presentation: '1',
        total_views: '120',
        total_downloads: '24',
        latest_published_at: '2026-05-28T00:00:00Z'
      })
  })

  it('returns deliverables with library health summary', async () => {
    const result = await deliverablesHandler({
      query: { projectId: 'project-1', type: 'image', limit: '25' }
    })

    expect(result.deliverables[0]).toMatchObject({
      id: 'deliverable-1',
      title: 'Campaign Creative',
      type: 'image',
      isFeatured: true,
      isFinal: true,
      projectName: 'Launch'
    })
    expect(result.summary).toEqual({
      total: 6,
      featured: 2,
      final: 4,
      recent: 3,
      approved: 1,
      published: 4,
      draft: 1,
      totalViews: 120,
      totalDownloads: 24,
      latestPublishedAt: '2026-05-28T00:00:00Z',
      byType: {
        image: 2,
        video: 1,
        document: 1,
        design: 1,
        presentation: 1
      }
    })

    const listSql = String(mockQueryRows.mock.calls[0]?.[0])
    const summarySql = String(mockQueryOne.mock.calls[1]?.[0])
    expect(listSql).toContain('cd.is_visible_to_client = true')
    expect(listSql).toContain('cd.project_id = $2')
    expect(listSql).toContain('cd.deliverable_type = $3')
    expect(summarySql).toContain('COUNT(*) FILTER (WHERE is_featured = true)')
    expect(summarySql).toContain('COUNT(*) FILTER (WHERE deliverable_type = \'presentation\')')
    expect(summarySql).toContain('COALESCE(SUM(download_count), 0)')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 'project-1', 'image', 25, 0])
  })
})
