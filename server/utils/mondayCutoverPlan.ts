import Fuse from 'fuse.js'
import { z } from 'zod'

export type CutoverColumnAction = 'import' | 'review' | 'exclude'
export type CutoverRecordAction = 'reuse' | 'create' | 'review' | 'exclude'

export interface MondayCutoverSourceBoard {
  id: string
  name: string
  state: 'active' | 'archived' | 'deleted'
  groups: Array<{ id: string, title: string }>
  columns: Array<{ id: string, title: string, type: string }>
}

export interface MondayCutoverSourceRecord {
  id: string
  title: string
  state: 'active' | 'archived' | 'deleted'
  createdAt: string
  updatedAt: string
  parentSourceId: string | null
  groupId: string | null
  groupTitle: string | null
  subitemCount: number
  clientHint: string | null
}

export interface MondayCutoverTargetTask {
  id: string
  title: string
  parentTaskId: string | null
  statusName: string
  mondayItemId: string | null
  mondayBoardId: string | null
  reconciliationStatus: string | null
}

export interface MondayCutoverClient {
  id: string
  name: string
  measurementProfileId: string | null
}

export interface MondayCutoverPlanInput {
  sourceBoard: MondayCutoverSourceBoard
  sourceRecords: MondayCutoverSourceRecord[]
  targetBoard: { id: string, name: string }
  targetTasks: MondayCutoverTargetTask[]
  clients: MondayCutoverClient[]
  isSourceTruncated: boolean
  isTargetTruncated?: boolean
}

const CutoverExceptionSchema = z.strictObject({
  code: z.string().min(1).max(100),
  severity: z.enum(['blocking', 'warning']),
  sourceId: z.string().max(100).nullable(),
  columnId: z.string().max(255).nullable(),
  message: z.string().min(1).max(1000)
})

export const MondayCutoverPlanResponseSchema = z.strictObject({
  mode: z.literal('dry_run'),
  source: z.strictObject({
    boardId: z.string().min(1).max(100),
    boardName: z.string().min(1).max(500),
    state: z.enum(['active', 'archived', 'deleted']),
    groups: z.number().int().nonnegative().max(100),
    topLevelItems: z.number().int().nonnegative().max(500),
    subitems: z.number().int().nonnegative().max(5000),
    totalRecords: z.number().int().nonnegative().max(5500),
    isTruncated: z.boolean()
  }),
  target: z.strictObject({
    boardId: z.string().uuid(),
    boardName: z.string().min(1).max(500),
    rootTasks: z.number().int().nonnegative(),
    subtasks: z.number().int().nonnegative(),
    totalRecords: z.number().int().nonnegative(),
    isTruncated: z.boolean()
  }),
  columnMappings: z.array(z.strictObject({
    sourceColumnId: z.string().min(1).max(255),
    sourceTitle: z.string().min(1).max(500),
    sourceType: z.string().min(1).max(100),
    destination: z.string().min(1).max(100),
    action: z.enum(['import', 'review', 'exclude']),
    reason: z.string().min(1).max(1000)
  })).max(200),
  records: z.array(z.strictObject({
    sourceId: z.string().min(1).max(100),
    parentSourceId: z.string().max(100).nullable(),
    title: z.string().min(1).max(500),
    kind: z.enum(['item', 'subitem']),
    sourceState: z.enum(['active', 'archived', 'deleted']),
    sourceUpdatedAt: z.string().datetime({ offset: true }),
    groupId: z.string().max(255).nullable(),
    groupTitle: z.string().max(500).nullable(),
    action: z.enum(['reuse', 'create', 'review', 'exclude']),
    match: z.strictObject({
      strategy: z.enum(['provenance', 'title', 'ambiguous', 'none']),
      targetTaskId: z.string().uuid().or(z.string().min(1).max(100)).nullable(),
      candidateTaskIds: z.array(z.string().min(1).max(100)).max(20)
    }),
    clientLink: z.strictObject({
      status: z.enum(['exact', 'suggested', 'missing', 'not_applicable']),
      clientId: z.string().uuid().or(z.string().min(1).max(100)).nullable(),
      clientName: z.string().min(1).max(500).nullable(),
      measurementProfileId: z.string().uuid().or(z.string().min(1).max(100)).nullable(),
      candidates: z.array(z.strictObject({
        clientId: z.string().uuid().or(z.string().min(1).max(100)),
        clientName: z.string().min(1).max(500),
        measurementProfileId: z.string().uuid().or(z.string().min(1).max(100)).nullable(),
        score: z.number().min(0).max(1)
      })).max(3)
    })
  })).max(5500),
  targetOnly: z.array(z.strictObject({
    id: z.string().uuid().or(z.string().min(1).max(100)),
    title: z.string().min(1).max(500),
    parentTaskId: z.string().uuid().or(z.string().min(1).max(100)).nullable(),
    statusName: z.string().min(1).max(255)
  })),
  exceptions: z.array(CutoverExceptionSchema),
  summary: z.strictObject({
    sourceRecords: z.number().int().nonnegative(),
    targetRecords: z.number().int().nonnegative(),
    mappedByProvenance: z.number().int().nonnegative(),
    matchedByTitleForReview: z.number().int().nonnegative(),
    toCreate: z.number().int().nonnegative(),
    ambiguous: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    targetOnly: z.number().int().nonnegative(),
    blockingExceptions: z.number().int().nonnegative(),
    warningExceptions: z.number().int().nonnegative(),
    isReadyForImport: z.boolean()
  })
})

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-AU')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function classifyColumn(column: MondayCutoverSourceBoard['columns'][number]) {
  const title = normalizeName(column.title)
  const type = column.type.toLowerCase()

  if (type === 'name') return mappedColumn(column, 'task.title', 'import', 'Canonical task title.')
  if (type === 'subtasks') return mappedColumn(column, 'task.parentTaskId', 'import', 'Preserve the Monday item/subitem hierarchy.')
  if (type === 'date' && /(go live|due date|deadline)/.test(title)) {
    return mappedColumn(column, 'task.dueDate', 'import', 'Import the governed rollout date as the task due date.')
  }
  if (type === 'people') {
    return mappedColumn(column, 'task.assigneeId', 'review', 'Requires an explicit Monday-user to Zero-team-member mapping.')
  }
  if (/(dealer group|client)/.test(title)) {
    return mappedColumn(column, 'agencyClient', 'review', 'Link to an existing Zero client; do not copy the label into a runtime configuration field.')
  }
  if (/(pixel|dataset)/.test(title)) {
    return mappedColumn(column, 'measurementDestination', 'exclude', 'Runtime provider identifiers remain in typed Measurement destinations.')
  }
  if (/(capi token|access token|credential)/.test(title)) {
    return mappedColumn(column, 'measurementCredential', 'exclude', 'Credential material and readiness remain in the encrypted Measurement credential store.')
  }
  if (/(dedup|event id)/.test(title)) {
    return mappedColumn(column, 'measurementEventIdentity', 'exclude', 'Event identity evidence remains in typed Measurement diagnostics.')
  }
  if (/(test event|test verified|validation)/.test(title)) {
    return mappedColumn(column, 'measurementValidation', 'exclude', 'Provider validation evidence remains in Measurement validation history.')
  }
  if (/(consent|privacy)/.test(title)) {
    return mappedColumn(column, 'measurementConsent', 'exclude', 'Consent configuration remains in the typed Measurement profile.')
  }
  if (/(domain|hostname|cname)/.test(title)) {
    return mappedColumn(column, 'measurementProfile', 'exclude', 'Collection hostname and tier remain in the typed Measurement profile.')
  }
  if (/(fbp|fbc|capture|conversion api|web capi|crm capi)/.test(title)) {
    return mappedColumn(column, 'measurementCapability', 'exclude', 'Capability readiness remains in the typed Measurement capability matrix.')
  }
  if (type === 'long_text' || /(notes|description)/.test(title)) {
    return mappedColumn(column, 'task.description', 'review', 'Review for secrets and personal data before importing useful operational context.')
  }
  if (type === 'status') {
    return mappedColumn(column, 'task.status', 'review', 'Requires an explicit source-label to Zero-status mapping.')
  }
  return mappedColumn(column, 'exception', 'review', 'No governed destination mapping exists for this column.')
}

function mappedColumn(
  column: MondayCutoverSourceBoard['columns'][number],
  destination: string,
  action: CutoverColumnAction,
  reason: string
) {
  return {
    sourceColumnId: column.id,
    sourceTitle: column.title,
    sourceType: column.type,
    destination,
    action,
    reason
  }
}

function buildClientLink(
  source: MondayCutoverSourceRecord,
  clients: MondayCutoverClient[],
  clientFuse: Fuse<MondayCutoverClient>
) {
  if (!source.clientHint) {
    return {
      status: 'not_applicable' as const,
      clientId: null,
      clientName: null,
      measurementProfileId: null,
      candidates: []
    }
  }

  const exact = clients.find(client => normalizeName(client.name) === normalizeName(source.clientHint!))
  if (exact) {
    return {
      status: 'exact' as const,
      clientId: exact.id,
      clientName: exact.name,
      measurementProfileId: exact.measurementProfileId,
      candidates: []
    }
  }

  const candidates = clientFuse.search(source.clientHint, { limit: 3 }).map(result => ({
    clientId: result.item.id,
    clientName: result.item.name,
    measurementProfileId: result.item.measurementProfileId,
    score: Math.min(1, Math.max(0, Number((result.score ?? 1).toFixed(4))))
  }))

  return {
    status: candidates.length > 0 ? 'suggested' as const : 'missing' as const,
    clientId: null,
    clientName: null,
    measurementProfileId: null,
    candidates
  }
}

export function buildMondayCutoverPlan(input: MondayCutoverPlanInput) {
  const exceptions: Array<z.infer<typeof CutoverExceptionSchema>> = []
  const columnMappings = input.sourceBoard.columns.map(classifyColumn)
  const matchedTargetIds = new Set<string>()
  const clientFuse = new Fuse(input.clients, {
    keys: ['name'],
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.6
  })

  if (input.isSourceTruncated) {
    exceptions.push({
      code: 'SOURCE_TRUNCATED',
      severity: 'blocking',
      sourceId: null,
      columnId: null,
      message: 'The Monday source exceeded the bounded dry-run read and cannot be imported completely.'
    })
  }

  if (input.isTargetTruncated) {
    exceptions.push({
      code: 'TARGET_TRUNCATED',
      severity: 'blocking',
      sourceId: null,
      columnId: null,
      message: 'The Zero target exceeded the bounded dry-run read and cannot be reconciled completely.'
    })
  }

  for (const mapping of columnMappings.filter(mapping => mapping.action === 'review')) {
    exceptions.push({
      code: 'COLUMN_REVIEW_REQUIRED',
      severity: 'blocking',
      sourceId: null,
      columnId: mapping.sourceColumnId,
      message: `${mapping.sourceTitle} requires an explicit governed mapping before import.`
    })
  }

  const records = input.sourceRecords.map((source) => {
    const isSubitem = Boolean(source.parentSourceId)
    const sameKindTargets = input.targetTasks.filter(target => Boolean(target.parentTaskId) === isSubitem)
    const provenanceMatches = sameKindTargets.filter(target => (
      target.mondayItemId === source.id && target.mondayBoardId === input.sourceBoard.id
    ))
    const titleMatches = sameKindTargets.filter(target => normalizeName(target.title) === normalizeName(source.title))

    let action: CutoverRecordAction
    let match: {
      strategy: 'provenance' | 'title' | 'ambiguous' | 'none'
      targetTaskId: string | null
      candidateTaskIds: string[]
    }

    if (source.state !== 'active') {
      action = 'exclude'
      match = { strategy: 'none', targetTaskId: null, candidateTaskIds: [] }
      exceptions.push({
        code: 'SOURCE_NOT_ACTIVE',
        severity: 'warning',
        sourceId: source.id,
        columnId: null,
        message: `Source ${source.id} is ${source.state} and is excluded from the active cutover.`
      })
    } else if (provenanceMatches.length === 1) {
      action = 'reuse'
      match = { strategy: 'provenance', targetTaskId: provenanceMatches[0]!.id, candidateTaskIds: [] }
      matchedTargetIds.add(provenanceMatches[0]!.id)
    } else if (provenanceMatches.length > 1) {
      action = 'review'
      match = { strategy: 'ambiguous', targetTaskId: null, candidateTaskIds: provenanceMatches.map(target => target.id) }
      exceptions.push({
        code: 'PROVENANCE_CONFLICT',
        severity: 'blocking',
        sourceId: source.id,
        columnId: null,
        message: `Multiple Zero tasks claim Monday source ${source.id}.`
      })
    } else if (titleMatches.length === 1) {
      action = 'review'
      match = { strategy: 'title', targetTaskId: titleMatches[0]!.id, candidateTaskIds: [] }
      matchedTargetIds.add(titleMatches[0]!.id)
      exceptions.push({
        code: 'TITLE_MATCH_REQUIRES_PROVENANCE',
        severity: 'blocking',
        sourceId: source.id,
        columnId: null,
        message: `Title-only match for source ${source.id} must be explicitly accepted before provenance is attached.`
      })
    } else if (titleMatches.length > 1) {
      action = 'review'
      match = { strategy: 'ambiguous', targetTaskId: null, candidateTaskIds: titleMatches.map(target => target.id) }
      exceptions.push({
        code: 'AMBIGUOUS_TITLE_MATCH',
        severity: 'blocking',
        sourceId: source.id,
        columnId: null,
        message: `Multiple Zero tasks match the title of Monday source ${source.id}.`
      })
    } else {
      action = 'create'
      match = { strategy: 'none', targetTaskId: null, candidateTaskIds: [] }
    }

    const clientLink = buildClientLink(source, input.clients, clientFuse)
    if (clientLink.status === 'suggested' || clientLink.status === 'missing') {
      exceptions.push({
        code: 'CLIENT_LINK_REQUIRED',
        severity: 'blocking',
        sourceId: source.id,
        columnId: null,
        message: `Source ${source.id} requires an explicit Zero client link.`
      })
    } else if (clientLink.status === 'exact' && !clientLink.measurementProfileId) {
      exceptions.push({
        code: 'MEASUREMENT_PROFILE_LINK_PENDING',
        severity: 'warning',
        sourceId: source.id,
        columnId: null,
        message: `The matched client for source ${source.id} does not yet have a Measurement profile link.`
      })
    }

    return {
      sourceId: source.id,
      parentSourceId: source.parentSourceId,
      title: source.title,
      kind: isSubitem ? 'subitem' as const : 'item' as const,
      sourceState: source.state,
      sourceUpdatedAt: source.updatedAt,
      groupId: source.groupId,
      groupTitle: source.groupTitle,
      action,
      match,
      clientLink
    }
  })

  const targetOnly = input.targetTasks
    .filter(target => !matchedTargetIds.has(target.id))
    .map(target => ({
      id: target.id,
      title: target.title,
      parentTaskId: target.parentTaskId,
      statusName: target.statusName
    }))

  const topLevelItems = input.sourceRecords.filter(record => !record.parentSourceId).length
  const subitems = input.sourceRecords.length - topLevelItems
  const rootTasks = input.targetTasks.filter(task => !task.parentTaskId).length
  const targetSubtasks = input.targetTasks.length - rootTasks
  const blockingExceptions = exceptions.filter(exception => exception.severity === 'blocking').length
  const warningExceptions = exceptions.length - blockingExceptions

  return MondayCutoverPlanResponseSchema.parse({
    mode: 'dry_run',
    source: {
      boardId: input.sourceBoard.id,
      boardName: input.sourceBoard.name,
      state: input.sourceBoard.state,
      groups: input.sourceBoard.groups.length,
      topLevelItems,
      subitems,
      totalRecords: input.sourceRecords.length,
      isTruncated: input.isSourceTruncated
    },
    target: {
      boardId: input.targetBoard.id,
      boardName: input.targetBoard.name,
      rootTasks,
      subtasks: targetSubtasks,
      totalRecords: input.targetTasks.length,
      isTruncated: Boolean(input.isTargetTruncated)
    },
    columnMappings,
    records,
    targetOnly,
    exceptions,
    summary: {
      sourceRecords: input.sourceRecords.length,
      targetRecords: input.targetTasks.length,
      mappedByProvenance: records.filter(record => record.match.strategy === 'provenance').length,
      matchedByTitleForReview: records.filter(record => record.match.strategy === 'title').length,
      toCreate: records.filter(record => record.action === 'create').length,
      ambiguous: records.filter(record => record.match.strategy === 'ambiguous').length,
      excluded: records.filter(record => record.action === 'exclude').length,
      targetOnly: targetOnly.length,
      blockingExceptions,
      warningExceptions,
      isReadyForImport: blockingExceptions === 0
    }
  })
}
