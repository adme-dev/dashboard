import { createHash } from 'node:crypto'

export interface MondayInventoryBoard {
  id: string
  name: string
  state: 'active' | 'archived' | 'deleted'
  providerType?: string | null
  boardKind?: string | null
  objectTypeUniqueKey?: string | null
  workspaceId?: string | null
  itemCount?: number | null
  permissions?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  owners: Array<{ id: string; name: string; email?: string | null }>
  subscribers: Array<{ id: string; name: string; email?: string | null }>
  teamOwnerIds?: string[]
  teamSubscriberIds?: string[]
  groups: Array<{ id: string; title: string; color?: string | null; position?: string | null }>
  columns: Array<{ id: string; title: string; type: string; settingsStr?: string | null }>
  views?: Array<{
    id: string
    name: string
    type: string
    settingsStr?: string | null
    viewSpecificDataStr?: string | null
  }>
}

export interface MondayInventorySource {
  apiVersion: string
  workspaceMembershipScope: 'all' | 'current_user_visible'
  getAccount(): Promise<{ id: string; name: string; slug?: string | null }>
  getWorkspacesPage(input: { page: number; limit: number }): Promise<{ entities: any[] }>
  getBoardsPage(input: { page: number; limit: number; state: 'active' | 'archived' }): Promise<{ entities: MondayInventoryBoard[] }>
  getUsersPage(input: { page: number; limit: number }): Promise<{ entities: any[] }>
}

export interface MondayInventoryWorkspace {
  id: string
  name: string
  state?: string | null
  kind?: string | null
  description?: string | null
  ownerIds: string[]
  subscriberIds: string[]
  teamOwnerIds?: string[]
  teamSubscriberIds: string[]
  isDefaultWorkspace?: boolean | null
  membershipTruncated?: boolean
  createdAt?: string | null
}

export interface MondayInventoryUser {
  id: string
  name: string
  email: string
  title?: string | null
  enabled: boolean
  isPending: boolean
  isAdmin: boolean
  isGuest: boolean
  isViewOnly: boolean
  teamIds: string[]
  lastActivity?: string | null
  createdAt?: string | null
}

export interface MondayInventoryFinding {
  code:
    | 'provider_api_unsupported'
    | 'provider_api_truncated'
    | 'main_workspace_unavailable'
    | 'team_membership_unresolved'
    | 'workspace_membership_scope_unavailable'
    | 'classification_unavailable'
    | 'missing_job_title'
    | 'ambiguous_job_title'
  entityType: string
  entityId?: string
  severity: 'warning' | 'blocker'
  message: string
  observedAt: string
}

export interface MondayInventoryCheckpoint {
  scope: 'workspaces' | 'boards:active' | 'boards:archived' | 'users'
  nextPage: number | null
  pagesCollected: number
  entitiesCollected: number
  status: 'pending' | 'complete' | 'failed'
}

export interface MondayInventoryManifest {
  schemaVersion: '1.0'
  provider: {
    name: 'monday'
    apiVersion: string
    accountId: string
    accountName: string
    accountSlug: string | null
  }
  observedAt: string
  workspaces: NormalizedWorkspace[]
  objects: {
    standardBoards: NormalizedBoard[]
    subitemBoards: NormalizedBoard[]
    customObjects: NormalizedBoard[]
    documents: NormalizedBoard[]
    unknown: NormalizedBoard[]
  }
  users: NormalizedUser[]
  edges: MondayInventoryEdge[]
  findings: MondayInventoryFinding[]
  completeness: {
    verdict: 'complete' | 'incomplete'
    pageSize: number
    counts: { workspaces: number; boards: number; users: number; edges: number; findings: number }
    checkpoints: MondayInventoryCheckpoint[]
    errors: Array<{ scope: string; page: number; message: string; observedAt: string }>
  }
  checksumSha256: string
}

interface NormalizedBoard {
  id: string
  name: string
  state: string
  providerType: string | null
  boardKind: string | null
  objectTypeUniqueKey: string | null
  workspaceId: string | null
  itemCount: number | null
  permissions: string | null
  ownerIds: string[]
  subscriberIds: string[]
  teamOwnerIds: string[]
  teamSubscriberIds: string[]
  groups: MondayInventoryBoard['groups']
  columns: Array<{ id: string; title: string; type: string; settingsStr: string | null }>
  views: Array<{ id: string; name: string; type: string; settingsStr: string | null; viewSpecificDataStr: string | null }>
  sourceCreatedAt: string | null
  sourceUpdatedAt: string | null
  observedAt: string
}

interface NormalizedWorkspace {
  id: string
  name: string
  state: string | null
  kind: string | null
  description: string | null
  isDefaultWorkspace: boolean | null
  ownerIds: string[]
  subscriberIds: string[]
  teamOwnerIds: string[]
  teamSubscriberIds: string[]
  membershipComplete: boolean
  sourceCreatedAt: string | null
  observedAt: string
}

interface NormalizedUser {
  id: string
  name: string
  email: string
  status: 'active' | 'disabled' | 'pending'
  title: string | null
  accountKind: 'admin' | 'guest' | 'view_only' | 'member'
  teamIds: string[]
  workspaceIds: string[]
  lastActivity: string | null
  sourceCreatedAt: string | null
  observedAt: string
}

interface MondayInventoryEdge {
  kind: 'dependency' | 'connect' | 'mirror'
  sourceBoardId: string
  sourceColumnId: string
  targetBoardId: string
  observedAt: string
}

interface BuildOptions {
  expectedAccountId: string
  observedAt: string
  pageSize?: number
  resume?: MondayInventoryManifest
  redactValues?: string[]
}

const scopes: MondayInventoryCheckpoint['scope'][] = ['workspaces', 'boards:active', 'boards:archived', 'users']

const unsupportedEntities = [
  ['automation', 'The pinned Monday API does not expose board automation definitions.'],
  ['dashboard', 'The pinned Monday API does not expose a complete account dashboard inventory.'],
  ['document', 'The pinned Monday API does not expose standalone workdocs; board-like documents are retained when returned by boards.'],
  ['integration', 'The pinned Monday API does not expose board integration recipes.'],
] as const

const completenessBlockingFindingCodes = new Set<MondayInventoryFinding['code']>([
  'provider_api_truncated',
  'main_workspace_unavailable',
  'team_membership_unresolved',
  'workspace_membership_scope_unavailable',
])

function sortedUnique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort(compareIds)
}

function compareIds(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true })
}

function normalizeBoard(board: MondayInventoryBoard, observedAt: string): NormalizedBoard {
  return {
    id: String(board.id),
    name: board.name,
    state: board.state,
    providerType: board.providerType ?? null,
    boardKind: board.boardKind ?? null,
    objectTypeUniqueKey: board.objectTypeUniqueKey ?? null,
    workspaceId: board.workspaceId ?? null,
    itemCount: board.itemCount ?? null,
    permissions: board.permissions ?? null,
    ownerIds: sortedUnique(board.owners.map(owner => owner.id)),
    subscriberIds: sortedUnique(board.subscribers.map(subscriber => subscriber.id)),
    teamOwnerIds: sortedUnique(board.teamOwnerIds || []),
    teamSubscriberIds: sortedUnique(board.teamSubscriberIds || []),
    groups: [...board.groups].map(group => ({ ...group })).sort((a, b) => compareIds(a.id, b.id)),
    columns: [...board.columns].map(column => ({
      id: column.id,
      title: column.title,
      type: column.type,
      settingsStr: column.settingsStr ?? null,
    })).sort((a, b) => compareIds(a.id, b.id)),
    views: [...(board.views || [])].map(view => ({
      id: String(view.id),
      name: view.name,
      type: view.type,
      settingsStr: view.settingsStr ?? null,
      viewSpecificDataStr: view.viewSpecificDataStr ?? null,
    })).sort((a, b) => compareIds(a.id, b.id)),
    sourceCreatedAt: board.createdAt ?? null,
    sourceUpdatedAt: board.updatedAt ?? null,
    observedAt,
  }
}

function classifyBoard(board: NormalizedBoard): keyof MondayInventoryManifest['objects'] {
  const type = (board.providerType || '').toLowerCase()
  const objectKey = (board.objectTypeUniqueKey || '').toLowerCase()
  if (type === 'sub_board' || type === 'subitem_board' || type === 'sub_items_board') return 'subitemBoards'
  if (type === 'document' || type === 'doc' || objectKey.includes('workdoc') || objectKey === 'document') return 'documents'
  if (type === 'custom_object' || (objectKey && !['board', 'standard_board'].includes(objectKey))) return 'customObjects'
  if (type === 'board' || type === 'standard_board') return 'standardBoards'
  return 'unknown'
}

function boardIdsFromSettings(value: unknown, key = ''): string[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.flatMap(entry => boardIdsFromSettings(entry, key))
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([childKey, child]) => boardIdsFromSettings(child, childKey))
  }
  return /board.*id|id.*board/i.test(key) && (typeof value === 'string' || typeof value === 'number') ? [String(value)] : []
}

function edgesForBoard(board: NormalizedBoard): MondayInventoryEdge[] {
  return board.columns.flatMap(column => {
    const type = column.type.toLowerCase()
    const kind = type.includes('mirror') ? 'mirror' : type.includes('depend') ? 'dependency' : type.includes('connect') || type.includes('relation') ? 'connect' : null
    if (!kind) return []
    let targetIds: string[] = []
    if (column.settingsStr) {
      try {
        targetIds = boardIdsFromSettings(JSON.parse(column.settingsStr))
      } catch {
        targetIds = []
      }
    }
    if (kind === 'dependency' && targetIds.length === 0) targetIds = [board.id]
    return sortedUnique(targetIds).map(targetBoardId => ({
      kind,
      sourceBoardId: board.id,
      sourceColumnId: column.id,
      targetBoardId,
      observedAt: board.observedAt,
    }))
  })
}

export function redactMondayInventoryError(error: unknown, values: string[] = []): string {
  let message = error instanceof Error ? error.message : String(error)
  for (const value of values.filter(Boolean)) message = message.split(value).join('[REDACTED]')
  message = message
    .replace(/(authorization\s*:\s*(?:bearer\s+)?)[^\s;,]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?token|token|secret)\s*[=:]\s*)[^\s;,]+/gi, '$1[REDACTED]')
  return message.slice(0, 500)
}

function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
  }
  return value
}

function checksumFor(manifest: Omit<MondayInventoryManifest, 'checksumSha256'>): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(manifest))).digest('hex')
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function validateResumeManifest(
  resume: MondayInventoryManifest,
  expectedAccountId: string,
  apiVersion: string,
  pageSize: number,
  observedAt: string,
): void {
  const candidate = resume as any
  if (!candidate || typeof candidate !== 'object' || candidate.schemaVersion !== '1.0') {
    throw new Error('Resume manifest schema must be 1.0')
  }
  if (candidate.provider?.name !== 'monday') throw new Error('Resume manifest provider must be monday')

  const { checksumSha256, ...unsigned } = candidate
  if (typeof checksumSha256 !== 'string' || checksumFor(unsigned) !== checksumSha256) {
    throw new Error('Resume manifest checksum is invalid')
  }
  if (String(candidate.provider.accountId) !== expectedAccountId) throw new Error('Resume manifest account does not match the requested account')
  if (candidate.provider.apiVersion !== apiVersion) throw new Error('Resume manifest API version does not match the inventory source')
  if (candidate.completeness?.pageSize !== pageSize) throw new Error('Resume manifest page size does not match this run')
  if (candidate.observedAt !== observedAt) throw new Error('Resume manifest observedAt must match the inventory run')
  if (!Array.isArray(candidate.workspaces) || !candidate.objects || !Array.isArray(candidate.users)) {
    throw new Error('Resume manifest schema is missing entity collections')
  }

  const objectCollections = ['standardBoards', 'subitemBoards', 'customObjects', 'documents', 'unknown']
  if (!objectCollections.every(key => Array.isArray(candidate.objects[key]))) {
    throw new Error('Resume manifest schema has invalid board collections')
  }
  const boards = objectCollections.flatMap(key => candidate.objects[key])
  const counts = candidate.completeness?.counts
  if (!counts
    || counts.workspaces !== candidate.workspaces.length
    || counts.boards !== boards.length
    || counts.users !== candidate.users.length) {
    throw new Error('Resume manifest schema counts do not match its entities')
  }

  const checkpointList = candidate.completeness?.checkpoints
  if (!Array.isArray(checkpointList) || checkpointList.length !== scopes.length) {
    throw new Error('Resume manifest checkpoint set is incomplete')
  }
  const checkpoints = new Map<string, any>()
  for (const checkpoint of checkpointList) {
    if (!checkpoint || !scopes.includes(checkpoint.scope) || checkpoints.has(checkpoint.scope)) {
      throw new Error('Resume manifest checkpoint set is invalid')
    }
    checkpoints.set(checkpoint.scope, checkpoint)
  }
  const expectedEntities = new Map<MondayInventoryCheckpoint['scope'], number>([
    ['workspaces', candidate.workspaces.length],
    ['boards:active', boards.filter((board: any) => board.state === 'active').length],
    ['boards:archived', boards.filter((board: any) => board.state === 'archived').length],
    ['users', candidate.users.length],
  ])
  for (const scope of scopes) {
    const checkpoint = checkpoints.get(scope)
    const collected = expectedEntities.get(scope)!
    if (!Number.isInteger(checkpoint.pagesCollected) || checkpoint.pagesCollected < 0
      || !Number.isInteger(checkpoint.entitiesCollected) || checkpoint.entitiesCollected !== collected) {
      throw new Error(`Resume manifest checkpoint ${scope} has inconsistent counts`)
    }
    if (checkpoint.status === 'complete') {
      if (checkpoint.nextPage !== null || checkpoint.pagesCollected < 1) {
        throw new Error(`Resume manifest checkpoint ${scope} could skip an uncollected page`)
      }
    } else if (checkpoint.status === 'failed') {
      if (!Number.isInteger(checkpoint.nextPage) || checkpoint.nextPage !== checkpoint.pagesCollected + 1) {
        throw new Error(`Resume manifest checkpoint ${scope} could skip an uncollected page`)
      }
    } else {
      throw new Error(`Resume manifest checkpoint ${scope} has an invalid status`)
    }
  }
}

export async function buildMondayInventoryManifest(source: MondayInventorySource, options: BuildOptions): Promise<MondayInventoryManifest> {
  const pageSize = options.pageSize ?? 100
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('pageSize must be an integer from 1 to 500')
  if (options.resume) validateResumeManifest(options.resume, options.expectedAccountId, source.apiVersion, pageSize, options.observedAt)

  let account: Awaited<ReturnType<MondayInventorySource['getAccount']>>
  try {
    account = await source.getAccount()
  } catch (error) {
    throw new Error(redactMondayInventoryError(error, options.redactValues || []))
  }
  if (String(account.id) !== options.expectedAccountId) {
    throw new Error(`Monday account mismatch: expected ${options.expectedAccountId}, received ${account.id}`)
  }

  const workspaceById = new Map<string, MondayInventoryWorkspace>()
  for (const workspace of options.resume?.workspaces || []) {
    workspaceById.set(workspace.id, {
      id: workspace.id,
      name: workspace.name,
      state: workspace.state,
      kind: workspace.kind,
      description: workspace.description,
      ownerIds: workspace.ownerIds,
      subscriberIds: workspace.subscriberIds,
      teamOwnerIds: workspace.teamOwnerIds,
      teamSubscriberIds: workspace.teamSubscriberIds,
      isDefaultWorkspace: workspace.isDefaultWorkspace,
      membershipTruncated: !workspace.membershipComplete,
      createdAt: workspace.sourceCreatedAt,
    })
  }
  const boardById = new Map<string, MondayInventoryBoard>()
  for (const collection of Object.values(options.resume?.objects || {})) {
    for (const board of collection) {
      boardById.set(board.id, {
        id: board.id,
        name: board.name,
        state: board.state as MondayInventoryBoard['state'],
        providerType: board.providerType,
        boardKind: board.boardKind,
        objectTypeUniqueKey: board.objectTypeUniqueKey,
        workspaceId: board.workspaceId,
        itemCount: board.itemCount,
        permissions: board.permissions,
        createdAt: board.sourceCreatedAt,
        updatedAt: board.sourceUpdatedAt,
        owners: board.ownerIds.map(id => ({ id, name: '' })),
        subscribers: board.subscriberIds.map(id => ({ id, name: '' })),
        teamOwnerIds: board.teamOwnerIds,
        teamSubscriberIds: board.teamSubscriberIds,
        groups: board.groups,
        columns: board.columns,
        views: board.views,
      })
    }
  }
  const userById = new Map<string, MondayInventoryUser>()
  for (const user of options.resume?.users || []) {
    userById.set(user.id, {
      id: user.id,
      name: user.name,
      email: user.email,
      title: user.title,
      enabled: user.status !== 'disabled',
      isPending: user.status === 'pending',
      isAdmin: user.accountKind === 'admin',
      isGuest: user.accountKind === 'guest',
      isViewOnly: user.accountKind === 'view_only',
      teamIds: user.teamIds,
      lastActivity: user.lastActivity,
      createdAt: user.sourceCreatedAt,
    })
  }

  const previousCheckpoints = new Map((options.resume?.completeness.checkpoints || []).map(checkpoint => [checkpoint.scope, checkpoint]))
  const checkpoints = new Map<MondayInventoryCheckpoint['scope'], MondayInventoryCheckpoint>()
  const errors: MondayInventoryManifest['completeness']['errors'] = []

  async function paginate<T>(
    scope: MondayInventoryCheckpoint['scope'],
    fetchPage: (page: number) => Promise<{ entities: T[] }>,
    accept: (entity: T) => void,
  ): Promise<void> {
    const previous = previousCheckpoints.get(scope)
    if (previous?.status === 'complete') {
      checkpoints.set(scope, { ...previous })
      return
    }
    let page = previous?.nextPage ?? 1
    let pagesCollected = previous?.pagesCollected ?? 0
    let entitiesCollected = previous?.entitiesCollected ?? 0
    while (true) {
      try {
        const result = await fetchPage(page)
        pagesCollected++
        for (const entity of result.entities) accept(entity)
        entitiesCollected += result.entities.length
        if (result.entities.length < pageSize) {
          checkpoints.set(scope, { scope, nextPage: null, pagesCollected, entitiesCollected, status: 'complete' })
          return
        }
        page++
      } catch (error) {
        checkpoints.set(scope, { scope, nextPage: page, pagesCollected, entitiesCollected, status: 'failed' })
        errors.push({ scope, page, message: redactMondayInventoryError(error, options.redactValues || []), observedAt: options.observedAt })
        return
      }
    }
  }

  await paginate('workspaces', page => source.getWorkspacesPage({ page, limit: pageSize }), workspace => {
    workspaceById.set(String(workspace.id), workspace as MondayInventoryWorkspace)
  })
  await paginate('boards:active', page => source.getBoardsPage({ page, limit: pageSize, state: 'active' }), board => {
    boardById.set(String(board.id), board)
  })
  await paginate('boards:archived', page => source.getBoardsPage({ page, limit: pageSize, state: 'archived' }), board => {
    boardById.set(String(board.id), board)
  })
  await paginate('users', page => source.getUsersPage({ page, limit: pageSize }), user => {
    userById.set(String(user.id), user as MondayInventoryUser)
  })

  const workspaces: NormalizedWorkspace[] = [...workspaceById.values()].map(workspace => ({
    id: String(workspace.id),
    name: workspace.name,
    state: workspace.state ?? null,
    kind: workspace.kind ?? null,
    description: workspace.description ?? null,
    isDefaultWorkspace: workspace.isDefaultWorkspace ?? null,
    ownerIds: sortedUnique(workspace.ownerIds),
    subscriberIds: sortedUnique(workspace.subscriberIds),
    teamOwnerIds: sortedUnique(workspace.teamOwnerIds || []),
    teamSubscriberIds: sortedUnique(workspace.teamSubscriberIds),
    membershipComplete: !workspace.membershipTruncated,
    sourceCreatedAt: workspace.createdAt ?? null,
    observedAt: options.observedAt,
  })).sort((a, b) => compareIds(a.id, b.id))

  const objects: MondayInventoryManifest['objects'] = { standardBoards: [], subitemBoards: [], customObjects: [], documents: [], unknown: [] }
  const findings: MondayInventoryFinding[] = unsupportedEntities.map(([entityType, message]) => ({
    code: 'provider_api_unsupported', entityType, severity: 'warning', message, observedAt: options.observedAt,
  }))
  if (source.workspaceMembershipScope !== 'all') {
    findings.push({
      code: 'workspace_membership_scope_unavailable', entityType: 'workspace', severity: 'blocker',
      message: 'Monday API 2025-04 cannot request membership_kind: all; only workspaces visible to the authenticated user can be inventoried.', observedAt: options.observedAt,
    })
  }
  for (const workspace of workspaces.filter(workspace => !workspace.membershipComplete)) {
    findings.push({
      code: 'provider_api_truncated', entityType: 'workspace_membership', entityId: workspace.id, severity: 'blocker',
      message: 'Monday caps nested workspace subscriber collections; this workspace membership inventory may be truncated.', observedAt: options.observedAt,
    })
  }
  if (!workspaces.some(workspace => workspace.isDefaultWorkspace === true)) {
    findings.push({
      code: 'main_workspace_unavailable', entityType: 'workspace', severity: 'blocker',
      message: 'Monday did not expose the account Main workspace, so workspace inventory cannot be certified complete.', observedAt: options.observedAt,
    })
  }
  for (const rawBoard of [...boardById.values()].sort((a, b) => compareIds(a.id, b.id))) {
    const board = normalizeBoard(rawBoard, options.observedAt)
    const classification = classifyBoard(board)
    objects[classification].push(board)
    if (classification === 'unknown') {
      findings.push({
        code: 'classification_unavailable', entityType: 'board', entityId: board.id, severity: 'blocker',
        message: 'The pinned provider response did not contain an explicit supported object type; no name-based inference was used.', observedAt: options.observedAt,
      })
    }
  }

  const workspaceIdsByUser = new Map<string, string[]>()
  const userIdsByTeam = new Map<string, string[]>()
  for (const user of userById.values()) {
    for (const teamId of sortedUnique(user.teamIds)) {
      userIdsByTeam.set(teamId, [...(userIdsByTeam.get(teamId) || []), String(user.id)])
    }
  }
  for (const workspace of workspaces) {
    for (const userId of sortedUnique([...workspace.ownerIds, ...workspace.subscriberIds])) {
      workspaceIdsByUser.set(userId, [...(workspaceIdsByUser.get(userId) || []), workspace.id])
    }
    for (const teamId of sortedUnique([...workspace.teamOwnerIds, ...workspace.teamSubscriberIds])) {
      const teamUserIds = teamId === '-1' ? [...userById.keys()] : userIdsByTeam.get(teamId)
      if (!teamUserIds) {
        findings.push({
          code: 'team_membership_unresolved', entityType: 'team', entityId: teamId, severity: 'blocker',
          message: `Workspace ${workspace.id} references a team whose membership was not present in the account user inventory.`, observedAt: options.observedAt,
        })
        continue
      }
      for (const userId of teamUserIds) {
        workspaceIdsByUser.set(userId, [...(workspaceIdsByUser.get(userId) || []), workspace.id])
      }
    }
  }
  const users: NormalizedUser[] = [...userById.values()].map(user => {
    const title = user.title ?? null
    if (title == null) {
      findings.push({ code: 'missing_job_title', entityType: 'user', entityId: user.id, severity: 'blocker', message: 'Exact Monday job title is missing; do not infer a role family.', observedAt: options.observedAt })
    } else if (title.trim() === '') {
      findings.push({ code: 'ambiguous_job_title', entityType: 'user', entityId: user.id, severity: 'blocker', message: 'Monday job title is blank; preserve it and resolve through owner review.', observedAt: options.observedAt })
    }
    return {
      id: String(user.id),
      name: user.name,
      email: user.email,
      status: user.isPending ? 'pending' : user.enabled ? 'active' : 'disabled',
      title,
      accountKind: user.isAdmin ? 'admin' : user.isGuest ? 'guest' : user.isViewOnly ? 'view_only' : 'member',
      teamIds: sortedUnique(user.teamIds),
      workspaceIds: sortedUnique(workspaceIdsByUser.get(String(user.id)) || []),
      lastActivity: user.lastActivity ?? null,
      sourceCreatedAt: user.createdAt ?? null,
      observedAt: options.observedAt,
    }
  }).sort((a, b) => compareIds(a.id, b.id))

  const edges = Object.values(objects).flatMap(collection => collection.flatMap(edgesForBoard)).sort((a, b) => (
    compareIds(a.sourceBoardId, b.sourceBoardId) || compareIds(a.sourceColumnId, b.sourceColumnId) || compareIds(a.targetBoardId, b.targetBoardId)
  ))
  findings.sort((a, b) => a.code.localeCompare(b.code) || a.entityType.localeCompare(b.entityType) || compareIds(a.entityId || '', b.entityId || ''))
  const checkpointList = scopes.map(scope => checkpoints.get(scope) || { scope, nextPage: 1, pagesCollected: 0, entitiesCollected: 0, status: 'pending' as const })
  const verdict = checkpointList.every(checkpoint => checkpoint.status === 'complete')
    && errors.length === 0
    && !findings.some(finding => completenessBlockingFindingCodes.has(finding.code))
    ? 'complete'
    : 'incomplete'
  const boards = Object.values(objects).reduce((total, collection) => total + collection.length, 0)
  const unsigned: Omit<MondayInventoryManifest, 'checksumSha256'> = {
    schemaVersion: '1.0',
    provider: { name: 'monday', apiVersion: source.apiVersion, accountId: String(account.id), accountName: account.name, accountSlug: account.slug ?? null },
    observedAt: options.observedAt,
    workspaces,
    objects,
    users,
    edges,
    findings,
    completeness: {
      verdict,
      pageSize,
      counts: { workspaces: workspaces.length, boards, users: users.length, edges: edges.length, findings: findings.length },
      checkpoints: checkpointList,
      errors: errors.sort((a, b) => a.scope.localeCompare(b.scope) || a.page - b.page),
    },
  }
  return deepFreeze({ ...unsigned, checksumSha256: checksumFor(unsigned) })
}

export function serializeMondayInventoryManifest(manifest: MondayInventoryManifest): string {
  return `${JSON.stringify(canonicalize(manifest), null, 2)}\n`
}
