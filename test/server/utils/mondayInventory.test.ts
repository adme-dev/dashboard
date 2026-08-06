import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MondayClient } from '../../../server/utils/mondayClient'
import { MondayGraphqlInventorySource } from '../../../server/utils/mondayInventorySource'
import {
  buildMondayInventoryManifest,
  serializeMondayInventoryManifest,
  type MondayInventoryBoard,
  type MondayInventorySource,
} from '../../../server/utils/mondayInventory'

const ofetch = vi.hoisted(() => vi.fn())

vi.mock('ofetch', () => ({ ofetch }))

const observedAt = '2026-08-07T01:02:03.000Z'

const standardBoard: MondayInventoryBoard = {
  id: '100',
  name: 'Archived campaigns that are still live',
  state: 'active',
  providerType: 'board',
  boardKind: 'public',
  workspaceId: '10',
  itemCount: 4,
  permissions: 'everyone',
  createdAt: '2024-01-02T03:04:05.000Z',
  updatedAt: '2026-07-02T03:04:05.000Z',
  owners: [{ id: '1', name: 'Ada', email: 'ada@example.com' }],
  subscribers: [{ id: '2', name: 'Grace', email: 'grace@example.com' }],
  teamOwnerIds: ['t1'],
  teamSubscriberIds: ['t2'],
  groups: [{ id: 'g1', title: 'Queue', color: '#579bfc', position: '1' }],
  views: [{ id: 'v1', name: 'Campaign intake', type: 'form', settingsStr: '{}', viewSpecificDataStr: '{"questions":1}' }],
  columns: [{
    id: 'linked',
    title: 'Dependency',
    type: 'board_relation',
    settingsStr: '{"boardIds":[{"boardId":"201"}]}',
  }],
}

function sourceFixture(overrides: Partial<MondayInventorySource> = {}): MondayInventorySource {
  const activePages: Record<number, MondayInventoryBoard[]> = {
    1: [standardBoard, {
      id: '101', name: 'Nested work', state: 'active', providerType: 'sub_items_board', boardKind: 'private',
      workspaceId: '10', itemCount: 2, owners: [], subscribers: [], groups: [], columns: [],
    }],
    2: [{
      id: '102', name: 'Deal object', state: 'active', providerType: 'custom_object', boardKind: 'share',
      objectTypeUniqueKey: 'crm_deal', workspaceId: '11', itemCount: 1, owners: [], subscribers: [], groups: [], columns: [],
    }, {
      id: '103', name: 'Launch brief', state: 'active', providerType: 'document', boardKind: 'public',
      objectTypeUniqueKey: 'workdoc', workspaceId: '11', itemCount: 0, owners: [], subscribers: [], groups: [], columns: [],
    }],
    3: [],
  }
  const archivedPages: Record<number, MondayInventoryBoard[]> = {
    1: [
      { id: '201', name: 'Old campaign', state: 'archived', providerType: 'board', boardKind: 'public', workspaceId: '10', itemCount: 5, owners: [], subscribers: [], groups: [], columns: [] },
      { id: '202', name: 'Old nested work', state: 'archived', providerType: 'sub_board', boardKind: 'private', workspaceId: '10', itemCount: 3, owners: [], subscribers: [], groups: [], columns: [] },
    ],
    2: [{ id: '203', name: 'Old custom object', state: 'archived', providerType: 'custom_object', boardKind: 'share', workspaceId: '11', itemCount: 1, owners: [], subscribers: [], groups: [], columns: [] }],
  }

  return {
    apiVersion: '2025-04',
    workspaceMembershipScope: 'all',
    getAccount: async () => ({ id: '229224', name: 'ADME', slug: 'adme2' }),
    getWorkspacesPage: async ({ page }) => ({
      entities: page === 1
        ? [
            { id: '10', name: 'Creative', state: 'active', kind: 'open', isDefaultWorkspace: true, ownerIds: ['1'], subscriberIds: ['1', '2'], teamOwnerIds: [], teamSubscriberIds: ['t1'] },
            { id: '11', name: 'Media', state: 'active', kind: 'closed', ownerIds: ['2'], subscriberIds: ['2'], teamSubscriberIds: [] },
          ]
        : page === 2
          ? [{ id: '12', name: 'Finance', state: 'active', kind: 'closed', ownerIds: [], subscriberIds: [], teamSubscriberIds: [] }]
          : [],
    }),
    getBoardsPage: async ({ page, state }) => ({ entities: (state === 'active' ? activePages : archivedPages)[page] || [] }),
    getUsersPage: async ({ page }) => ({
      entities: page === 1
        ? [
            { id: '1', name: 'Ada', email: 'ada@example.com', enabled: true, isPending: false, isAdmin: true, isGuest: false, isViewOnly: false, title: 'Creative Director', teamIds: ['t1'], lastActivity: '2026-08-01T00:00:00Z' },
            { id: '2', name: 'Grace', email: 'grace@example.com', enabled: true, isPending: false, isAdmin: false, isGuest: false, isViewOnly: false, title: null, teamIds: ['t1'], lastActivity: null },
          ]
        : page === 2
          ? [{ id: '3', name: 'Linus', email: 'linus@example.com', enabled: false, isPending: true, isAdmin: false, isGuest: true, isViewOnly: false, title: 'Developer', teamIds: [], lastActivity: '2026-07-30T00:00:00Z' }]
          : [],
    }),
    ...overrides,
  }
}

describe('Monday production inventory', () => {
  beforeEach(() => ofetch.mockReset())

  it('asks Monday for the requested archived state instead of filtering an active page', async () => {
    ofetch.mockImplementation(async (...args) => {
      const query = JSON.stringify(args)
      return query.includes('state: archived')
        ? { data: { boards: [{ id: '9', name: 'Archived', type: 'board', state: 'archived' }] } }
        : { data: { boards: [{ id: '8', name: 'Active', type: 'board', state: 'active' }] } }
    })

    const boards = await new MondayClient('not-a-real-token').getBoards({ state: 'archived', limit: 100, page: 1 })

    expect(boards.map(board => board.id)).toEqual(['9'])
  })

  it('rejects invalid runtime board states before constructing GraphQL', async () => {
    const client = new MondayClient('not-a-real-token')

    await expect(client.getBoards({ state: 'unexpected' } as any)).rejects.toThrow('Invalid Monday board state')
    expect(ofetch).not.toHaveBeenCalled()
  })

  it("defines state 'all' as active plus archived and never returns deleted boards", async () => {
    ofetch.mockResolvedValue({ data: { boards: [
      { id: '1', name: 'Active', type: 'board', state: 'active' },
      { id: '2', name: 'Archived', type: 'board', state: 'archived' },
      { id: '3', name: 'Deleted', type: 'board', state: 'deleted' },
    ] } })

    const boards = await new MondayClient('not-a-real-token').getBoards({ state: 'all' })

    expect(boards.map(board => board.id)).toEqual(['1', '2'])
  })

  it('collects uncapped active and archived pages and classifies every provider object kind without using its name', async () => {
    const manifest = await buildMondayInventoryManifest(sourceFixture(), {
      expectedAccountId: '229224', observedAt, pageSize: 2,
    })

    expect(manifest.completeness.verdict).toBe('complete')
    expect(manifest.objects.standardBoards.map(board => [board.id, board.state])).toEqual([['100', 'active'], ['201', 'archived']])
    expect(manifest.objects.subitemBoards.map(board => board.id)).toEqual(['101', '202'])
    expect(manifest.objects.customObjects.map(board => board.id)).toEqual(['102', '203'])
    expect(manifest.objects.documents.map(board => board.id)).toEqual(['103'])
    expect(manifest.objects.standardBoards[0].name).toContain('Archived')
    expect(manifest.completeness.counts.boards).toBe(7)
    expect(manifest.completeness.checkpoints.find(value => value.scope === 'boards:active')).toMatchObject({ pagesCollected: 3, entitiesCollected: 4, status: 'complete' })
    expect(manifest.completeness.checkpoints.find(value => value.scope === 'boards:archived')).toMatchObject({ pagesCollected: 2, entitiesCollected: 3, status: 'complete' })
  })

  it('preserves structural metadata, source timestamps, explicit edges, and typed API gaps', async () => {
    const manifest = await buildMondayInventoryManifest(sourceFixture(), {
      expectedAccountId: '229224', observedAt, pageSize: 2,
    })

    expect(manifest.objects.standardBoards[0]).toMatchObject({
      id: '100', workspaceId: '10', permissions: 'everyone', itemCount: 4,
      sourceCreatedAt: '2024-01-02T03:04:05.000Z', sourceUpdatedAt: '2026-07-02T03:04:05.000Z', observedAt,
      ownerIds: ['1'], subscriberIds: ['2'],
      teamOwnerIds: ['t1'], teamSubscriberIds: ['t2'],
      views: [{ id: 'v1', name: 'Campaign intake', type: 'form', settingsStr: '{}', viewSpecificDataStr: '{"questions":1}' }],
    })
    expect(manifest.edges).toContainEqual({
      kind: 'connect', sourceBoardId: '100', sourceColumnId: 'linked', targetBoardId: '201', observedAt,
    })
    expect(manifest.findings.filter(finding => finding.code === 'provider_api_unsupported').map(finding => finding.entityType)).toEqual([
      'automation', 'dashboard', 'document', 'integration',
    ])
  })

  it('queries and preserves supported board updates, views, forms, and team references', async () => {
    const requester = vi.fn(async (query: string) => ({ boards: query.includes('InventoryBoards') ? [{
      id: '500', name: 'Form board', type: 'board', state: 'active', board_kind: 'private', workspace_id: '10',
      items_count: 2, permissions: 'owners', updated_at: '2026-08-06T00:00:00Z', owners: [], subscribers: [],
      team_owners: [{ id: 't1' }], team_subscribers: [{ id: 't2' }],
      groups: [], columns: [], views: [{ id: 'v1', name: 'Intake', type: 'form', settings_str: '{}', view_specific_data_str: '{"questions":1}' }],
    }] : [] }))
    const source = new MondayGraphqlInventorySource('not-a-real-token', requester)

    const page = await source.getBoardsPage({ page: 1, limit: 100, state: 'active' })

    expect(page.entities[0]).toMatchObject({
      updatedAt: '2026-08-06T00:00:00Z',
      teamOwnerIds: ['t1'],
      teamSubscriberIds: ['t2'],
      views: [{ id: 'v1', name: 'Intake', type: 'form', settingsStr: '{}', viewSpecificDataStr: '{"questions":1}' }],
    })
    const query = requester.mock.calls[0][0]
    expect(query).toContain('updated_at')
    expect(query).toMatch(/team_owners\s*\{\s*id\s*\}/)
    expect(query).toMatch(/team_subscribers\s*\{\s*id\s*\}/)
    expect(query).toContain('views')
  })

  it('queries workspace identity fields and emits only the canonical workspace schema', async () => {
    const requester = vi.fn(async () => ({ workspaces: [{
      id: '10', name: 'Creative', description: 'Studio', kind: 'open', state: 'active',
      created_at: '2024-01-01', is_default_workspace: true,
      owners_subscribers: [], users_subscribers: [], team_owners_subscribers: [], teams_subscribers: [],
    }] }))
    const source = new MondayGraphqlInventorySource('not-a-real-token', requester)
    const page = await source.getWorkspacesPage({ page: 1, limit: 100 })
    const manifest = await buildMondayInventoryManifest(sourceFixture({
      getWorkspacesPage: async ({ page: pageNumber }) => ({ entities: pageNumber === 1 ? page.entities : [] }),
    }), { expectedAccountId: '229224', observedAt, pageSize: 2 })

    expect(requester.mock.calls[0][0]).toContain('is_default_workspace')
    expect(requester.mock.calls[0][0]).not.toContain('membership_kind')
    expect(source.workspaceMembershipScope).toBe('current_user_visible')
    expect(Object.keys(manifest.workspaces[0]).sort()).toEqual([
      'description', 'id', 'isDefaultWorkspace', 'kind', 'membershipComplete', 'name', 'observedAt',
      'ownerIds', 'sourceCreatedAt', 'state', 'subscriberIds', 'teamOwnerIds', 'teamSubscriberIds',
    ])
    expect(manifest.workspaces[0]).toMatchObject({
      id: '10', isDefaultWorkspace: true, membershipComplete: true, sourceCreatedAt: '2024-01-01',
    })
  })

  it('preserves exact titles and states while flagging missing titles without guessing', async () => {
    const manifest = await buildMondayInventoryManifest(sourceFixture(), {
      expectedAccountId: '229224', observedAt, pageSize: 2,
    })

    expect(manifest.users).toEqual([
      expect.objectContaining({ id: '1', title: 'Creative Director', status: 'active', accountKind: 'admin', teamIds: ['t1'], workspaceIds: ['10'] }),
      expect.objectContaining({ id: '2', title: null, status: 'active', accountKind: 'member', teamIds: ['t1'], workspaceIds: ['10', '11'] }),
      expect.objectContaining({ id: '3', title: 'Developer', status: 'pending', accountKind: 'guest', teamIds: [], workspaceIds: [] }),
    ])
    expect(manifest.findings).toContainEqual(expect.objectContaining({ code: 'missing_job_title', entityType: 'user', entityId: '2' }))
  })

  it('combines active, pending, and inactive user pages from the pinned legacy API', async () => {
    const requester = vi.fn(async (query: string) => query.includes('non_active: true')
      ? { users: [{ id: '3', name: 'Inactive', email: 'inactive@example.com', title: 'Producer', enabled: false, is_pending: false, is_admin: false, is_guest: false, is_view_only: false, teams: [] }] }
      : { users: [
          { id: '1', name: 'Active', email: 'active@example.com', title: 'Director', enabled: true, is_pending: false, is_admin: true, is_guest: false, is_view_only: false, teams: [] },
          { id: '2', name: 'Pending', email: 'pending@example.com', title: null, enabled: true, is_pending: true, is_admin: false, is_guest: true, is_view_only: false, teams: [] },
        ] })
    const source = new MondayGraphqlInventorySource('not-a-real-token', requester)

    const page = await source.getUsersPage({ page: 1, limit: 100 })

    expect(page.entities.map(user => user.id)).toEqual(['1', '2', '3'])
  })

  it('marks nested workspace membership caps and an unavailable Main workspace as incomplete', async () => {
    const source = sourceFixture({
      workspaceMembershipScope: 'current_user_visible',
      getWorkspacesPage: async ({ page }) => ({ entities: page === 1 ? [{
        id: '10', name: 'Creative', state: 'active', kind: 'open', isDefaultWorkspace: false,
        ownerIds: ['1'], subscriberIds: ['1'], teamOwnerIds: [], teamSubscriberIds: ['unresolved-team'],
        membershipTruncated: true,
      }] : [] }),
    })

    const manifest = await buildMondayInventoryManifest(source, { expectedAccountId: '229224', observedAt, pageSize: 2 })

    expect(manifest.completeness.verdict).toBe('incomplete')
    expect(manifest.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'provider_api_truncated', entityType: 'workspace_membership', entityId: '10' }),
      expect.objectContaining({ code: 'main_workspace_unavailable', entityType: 'workspace' }),
      expect.objectContaining({ code: 'team_membership_unresolved', entityType: 'team', entityId: 'unresolved-team' }),
      expect.objectContaining({ code: 'workspace_membership_scope_unavailable', entityType: 'workspace' }),
    ]))
  })

  it('produces immutable, byte-identical canonical manifests and checksums for unchanged input', async () => {
    const first = await buildMondayInventoryManifest(sourceFixture(), { expectedAccountId: '229224', observedAt, pageSize: 2 })
    const second = await buildMondayInventoryManifest(sourceFixture(), { expectedAccountId: '229224', observedAt, pageSize: 2 })
    const firstBytes = serializeMondayInventoryManifest(first)
    const secondBytes = serializeMondayInventoryManifest(second)
    const unsigned = JSON.parse(firstBytes)
    delete unsigned.checksumSha256

    expect(firstBytes).toBe(secondBytes)
    expect(first.checksumSha256).toBe(createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'))
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.objects.standardBoards)).toBe(true)
  })

  it('records the failing page and an incomplete verdict instead of claiming a partial collection is complete', async () => {
    const source = sourceFixture({
      getBoardsPage: async ({ state, page }) => {
        if (state === 'archived' && page === 2) throw new Error('Monday page timed out')
        return sourceFixture().getBoardsPage({ state, page, limit: 2 })
      },
    })

    const manifest = await buildMondayInventoryManifest(source, { expectedAccountId: '229224', observedAt, pageSize: 2 })

    expect(manifest.completeness.verdict).toBe('incomplete')
    expect(manifest.completeness.errors).toContainEqual(expect.objectContaining({ scope: 'boards:archived', page: 2, message: 'Monday page timed out' }))
    expect(manifest.completeness.checkpoints.find(value => value.scope === 'boards:archived')).toMatchObject({ nextPage: 2, status: 'failed' })
  })

  it('redacts raw secrets from errors and the serialized output', async () => {
    const source = sourceFixture({
      getUsersPage: async () => { throw new Error('Authorization: Bearer super-secret; token=super-secret') },
    })

    const manifest = await buildMondayInventoryManifest(source, {
      expectedAccountId: '229224', observedAt, pageSize: 2, redactValues: ['super-secret'],
    })
    const bytes = serializeMondayInventoryManifest(manifest)

    expect(bytes).not.toContain('super-secret')
    expect(manifest.completeness.errors[0].message).toContain('[REDACTED]')
  })

  it('resumes from the failing checkpoint without duplicating already collected entities', async () => {
    let failOnce = true
    const source = sourceFixture({
      getBoardsPage: async ({ state, page }) => {
        if (failOnce && state === 'archived' && page === 2) {
          failOnce = false
          throw new Error('temporary failure')
        }
        return sourceFixture().getBoardsPage({ state, page, limit: 2 })
      },
    })
    const partial = await buildMondayInventoryManifest(source, { expectedAccountId: '229224', observedAt, pageSize: 2 })

    const resumed = await buildMondayInventoryManifest(source, {
      expectedAccountId: '229224', observedAt, pageSize: 2, resume: partial,
    })

    expect(resumed.completeness.verdict).toBe('complete')
    expect(resumed.objects.standardBoards.filter(board => board.id === '201')).toHaveLength(1)
    expect(resumed.objects.subitemBoards.filter(board => board.id === '202')).toHaveLength(1)
    expect(resumed.objects.customObjects.filter(board => board.id === '203')).toHaveLength(1)
    expect(resumed.completeness.counts.boards).toBe(7)
  })

  it.each([
    ['schema', (resume: any) => { resume.schemaVersion = '0.9'; resign(resume) }, 'schema'],
    ['provider', (resume: any) => { resume.provider.name = 'other'; resign(resume) }, 'provider'],
    ['checksum', (resume: any) => { resume.checksumSha256 = '0'.repeat(64) }, 'checksum'],
    ['account', (resume: any) => { resume.provider.accountId = 'wrong'; resign(resume) }, 'account'],
    ['API version', (resume: any) => { resume.provider.apiVersion = '2026-07'; resign(resume) }, 'API version'],
    ['page size', (resume: any) => { resume.completeness.pageSize = 99; resign(resume) }, 'page size'],
  ])('rejects a resume manifest with invalid %s before hydrating it', async (_case, mutate, expected) => {
    const manifest = await buildMondayInventoryManifest(sourceFixture(), { expectedAccountId: '229224', observedAt, pageSize: 2 })
    const resume = JSON.parse(serializeMondayInventoryManifest(manifest))
    mutate(resume)

    await expect(buildMondayInventoryManifest(sourceFixture(), {
      expectedAccountId: '229224', observedAt, pageSize: 2, resume,
    })).rejects.toThrow(expected)
  })

  it('rejects a resume checkpoint that would skip an uncollected page', async () => {
    const manifest = await buildMondayInventoryManifest(sourceFixture(), { expectedAccountId: '229224', observedAt, pageSize: 2 })
    const resume = JSON.parse(serializeMondayInventoryManifest(manifest))
    const active = resume.completeness.checkpoints.find((checkpoint: any) => checkpoint.scope === 'boards:active')
    active.status = 'failed'
    active.pagesCollected = 2
    active.nextPage = 4
    resign(resume)

    await expect(buildMondayInventoryManifest(sourceFixture(), {
      expectedAccountId: '229224', observedAt, pageSize: 2, resume,
    })).rejects.toThrow('checkpoint')
  })

  it('accepts a complete resume when a composite provider page contains more than the requested page size', async () => {
    const compositeUsers = sourceFixture({
      getUsersPage: async ({ page }) => ({ entities: page === 1
        ? [
            { id: '1', name: 'A', email: 'a@example.com', enabled: true, isPending: false, isAdmin: false, isGuest: false, isViewOnly: false, title: 'A', teamIds: [] },
            { id: '2', name: 'B', email: 'b@example.com', enabled: true, isPending: false, isAdmin: false, isGuest: false, isViewOnly: false, title: 'B', teamIds: [] },
            { id: '3', name: 'C', email: 'c@example.com', enabled: false, isPending: false, isAdmin: false, isGuest: false, isViewOnly: false, title: 'C', teamIds: [] },
          ]
        : page === 2
          ? [{ id: '4', name: 'D', email: 'd@example.com', enabled: false, isPending: false, isAdmin: false, isGuest: false, isViewOnly: false, title: 'D', teamIds: [] }]
          : [] }),
    })
    const manifest = await buildMondayInventoryManifest(compositeUsers, { expectedAccountId: '229224', observedAt, pageSize: 2 })

    await expect(buildMondayInventoryManifest(compositeUsers, {
      expectedAccountId: '229224', observedAt, pageSize: 2, resume: manifest,
    })).resolves.toMatchObject({ checksumSha256: manifest.checksumSha256 })
  })

  it('redacts account bootstrap failures before they reach operator stderr', async () => {
    const source = sourceFixture({
      getAccount: async () => { throw new Error('Authorization: Bearer bootstrap-secret token=bootstrap-secret') },
    })

    await expect(buildMondayInventoryManifest(source, {
      expectedAccountId: '229224', observedAt, pageSize: 2, redactValues: ['bootstrap-secret'],
    })).rejects.toThrow('Authorization: Bearer [REDACTED] token=[REDACTED]')
  })

  it('creates evidence exclusively and refuses an existing output while cleaning temporary files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'monday-inventory-test-'))
    const target = join(directory, 'manifest.json')
    try {
      const { writeManifestExclusive } = await import('../../../scripts/inventory-monday')
      await writeManifestExclusive(target, '{"first":true}\n', 'first')
      await expect(writeManifestExclusive(target, '{"second":true}\n', 'second')).rejects.toThrow('already exists')

      expect(await readFile(target, 'utf8')).toBe('{"first":true}\n')
      expect(await readdir(directory)).toEqual(['manifest.json'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

function resign(manifest: any): void {
  const unsigned = { ...manifest }
  delete unsigned.checksumSha256
  manifest.checksumSha256 = createHash('sha256').update(JSON.stringify(canonical(unsigned))).digest('hex')
}

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  }
  return value
}
