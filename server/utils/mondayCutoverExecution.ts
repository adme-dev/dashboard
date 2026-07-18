import { z } from 'zod'

const BoardIdSchema = z.string().trim().regex(/^\d+$/).max(30)
const TargetBoardIdSchema = z.string().uuid()
const RevisionSchema = z.number().int().positive().max(2_147_483_647)
const FingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/)
const ReasonSchema = z.string().trim().min(10).max(1000)

export const MondayCutoverExecutionCommandSchema = z.strictObject({
  targetBoardId: TargetBoardIdSchema,
  expectedArtifactRevision: RevisionSchema,
  expectedPlanFingerprint: FingerprintSchema,
  idempotencyKey: z.string().uuid(),
  confirmation: z.string().trim().min(1).max(200),
  reason: ReasonSchema
})

export type MondayCutoverExecutionCommand = z.infer<typeof MondayCutoverExecutionCommandSchema>

export const MondayCutoverRollbackCommandSchema = z.strictObject({
  targetBoardId: TargetBoardIdSchema,
  expectedPlanFingerprint: FingerprintSchema,
  confirmation: z.string().trim().min(1).max(200),
  reason: ReasonSchema
})

export type MondayCutoverRollbackCommand = z.infer<typeof MondayCutoverRollbackCommandSchema>

export class MondayCutoverExecutionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MondayCutoverExecutionValidationError'
  }
}

export function buildMondayCutoverExecutionConfirmation(
  sourceBoardId: string,
  targetBoardId: string
): string {
  return `EXECUTE MONDAY ${BoardIdSchema.parse(sourceBoardId)} INTO ZERO ${TargetBoardIdSchema.parse(targetBoardId)}`
}

export function hasValidMondayCutoverExecutionConfirmation(
  sourceBoardId: string,
  command: MondayCutoverExecutionCommand
): boolean {
  return command.confirmation === buildMondayCutoverExecutionConfirmation(
    sourceBoardId,
    command.targetBoardId
  )
}

export function buildMondayCutoverRollbackConfirmation(runId: string): string {
  return `ROLLBACK MONDAY CUTOVER ${z.string().uuid().parse(runId)}`
}

export function hasValidMondayCutoverRollbackConfirmation(
  runId: string,
  command: MondayCutoverRollbackCommand
): boolean {
  return command.confirmation === buildMondayCutoverRollbackConfirmation(runId)
}

type CutoverPlanRecord = {
  sourceId: string
  parentSourceId: string | null
  title: string
  sourceUpdatedAt: string
  action: 'reuse' | 'create' | 'review' | 'exclude'
  match: { strategy: string, targetTaskId: string | null }
  clientLink: {
    status: 'exact' | 'resolved' | 'suggested' | 'missing' | 'not_applicable'
    clientId: string | null
    clientName: string | null
  }
}

type CutoverExecutionPlan = {
  source: { boardId: string }
  target: { boardId: string }
  placement: {
    targetGroupId: string | null
    targetGroupName: string | null
    status: 'not_required' | 'pending' | 'applied' | 'invalid'
  }
  columnMappings: Array<{
    sourceColumnId: string
    destination: string
    action: 'import' | 'review' | 'exclude'
  }>
  records: CutoverPlanRecord[]
  summary: { blockingExceptions: number, isReadyForImport: boolean }
}

export type MondayCutoverExecutionSourceRecord = {
  id: string
  parentSourceId: string | null
  updatedAt: string
  groupId: string | null
  groupTitle: string | null
  columnTexts: Record<string, string>
}

export type MondayCutoverTaskDraft = {
  sourceId: string
  parentSourceId: string | null
  parentTargetTaskId: string | null
  sourceUpdatedAt: string
  sourceGroupId: string | null
  sourceGroupTitle: string | null
  title: string
  description: string | null
  dueDate: string | null
  targetGroupId: string
  clientId: string | null
  clientName: string | null
  sortOrder: number
}

function parseDueDate(value: string | undefined, sourceId: string): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new MondayCutoverExecutionValidationError(`Invalid approved due date for source ${sourceId}`)
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new MondayCutoverExecutionValidationError(`Invalid approved due date for source ${sourceId}`)
  }
  return trimmed
}

export function buildMondayCutoverTaskDrafts(input: {
  plan: CutoverExecutionPlan
  sourceRecords: MondayCutoverExecutionSourceRecord[]
}): MondayCutoverTaskDraft[] {
  if (!input.plan.summary.isReadyForImport || input.plan.summary.blockingExceptions !== 0) {
    throw new MondayCutoverExecutionValidationError('Monday cutover plan is not import-ready')
  }
  if (input.plan.placement.status !== 'applied' || !input.plan.placement.targetGroupId) {
    throw new MondayCutoverExecutionValidationError('Monday cutover has no approved target placement')
  }

  const sourceById = new Map(input.sourceRecords.map(source => [source.id, source]))
  const planById = new Map(input.plan.records.map(record => [record.sourceId, record]))
  const dueDateColumns = input.plan.columnMappings.filter(mapping => (
    mapping.action === 'import' && mapping.destination === 'task.dueDate'
  ))
  const descriptionColumns = input.plan.columnMappings.filter(mapping => (
    mapping.action === 'import' && mapping.destination === 'task.description'
  ))
  const creates = input.plan.records
    .filter(record => record.action === 'create')
    .sort((left, right) => Number(Boolean(left.parentSourceId)) - Number(Boolean(right.parentSourceId)))

  const clientBySource = new Map<string, { clientId: string | null, clientName: string | null }>()
  const drafts: MondayCutoverTaskDraft[] = []

  for (const [sortOrder, record] of creates.entries()) {
    const source = sourceById.get(record.sourceId)
    if (!source || source.updatedAt !== record.sourceUpdatedAt || source.parentSourceId !== record.parentSourceId) {
      throw new MondayCutoverExecutionValidationError(`Stale Monday source snapshot for ${record.sourceId}`)
    }
    if (record.title.length > 255) {
      throw new MondayCutoverExecutionValidationError(`Monday source title exceeds Zero limits for ${record.sourceId}`)
    }

    let client = record.clientLink.status === 'exact' || record.clientLink.status === 'resolved'
      ? { clientId: record.clientLink.clientId, clientName: record.clientLink.clientName }
      : { clientId: null, clientName: null }
    let parentTargetTaskId: string | null = null

    if (record.parentSourceId) {
      const parentRecord = planById.get(record.parentSourceId)
      if (!parentRecord) {
        throw new MondayCutoverExecutionValidationError(`Missing approved parent for ${record.sourceId}`)
      }
      client = clientBySource.get(record.parentSourceId) ?? client
      if (parentRecord.action === 'reuse') {
        parentTargetTaskId = parentRecord.match.targetTaskId
        if (!parentTargetTaskId) {
          throw new MondayCutoverExecutionValidationError(`Missing reused parent target for ${record.sourceId}`)
        }
      } else if (parentRecord.action !== 'create') {
        throw new MondayCutoverExecutionValidationError(`Parent is not executable for ${record.sourceId}`)
      }
    }
    clientBySource.set(record.sourceId, client)

    const dueDateValues = dueDateColumns
      .map(mapping => source.columnTexts[mapping.sourceColumnId])
      .filter((value): value is string => Boolean(value?.trim()))
    if (dueDateValues.length > 1) {
      throw new MondayCutoverExecutionValidationError(`Multiple approved due dates for source ${record.sourceId}`)
    }
    const descriptionValues = descriptionColumns
      .map(mapping => source.columnTexts[mapping.sourceColumnId]?.trim())
      .filter((value): value is string => Boolean(value))

    drafts.push({
      sourceId: record.sourceId,
      parentSourceId: record.parentSourceId,
      parentTargetTaskId,
      sourceUpdatedAt: record.sourceUpdatedAt,
      sourceGroupId: source.groupId,
      sourceGroupTitle: source.groupTitle,
      title: record.title,
      description: descriptionValues.length ? descriptionValues.join('\n\n') : null,
      dueDate: parseDueDate(dueDateValues[0], record.sourceId),
      targetGroupId: input.plan.placement.targetGroupId,
      clientId: client.clientId,
      clientName: client.clientName,
      sortOrder
    })
  }

  return drafts
}
