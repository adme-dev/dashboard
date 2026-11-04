import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { transaction } from '~~/server/utils/db'
import type { GodModeTransactionDb as Db } from '~~/server/utils/godMode/transactionCoordinator'
import type { MediaProjectActor } from '~~/server/utils/audio/projects'
import type { StoryboardPlan, ReadinessFinding } from '~~/shared/video/storyboard'
import { resolveStoryboardRecipe } from '~~/shared/video/storyboardRecipes'
import { requireStoryboardProjectIn } from './access'
import { getStoryboardIn, saveStoryboardRevisionIn } from './store'
import { canonicalReferenceIn, checkReferencesIn, type ReferenceDependencies } from './references'
import { prepareStoryboardCopy } from './copy'
import { StoryboardPlanningRequestSchema, StoryboardAcceptRequestSchema, type StoryboardPlanningRequest, type StoryboardAcceptRequest } from './planningRequest'
import { createStoryboardCandidate, validateCandidate, candidateDiff, STORYBOARD_SYSTEM_PROMPT, type PlanningContext } from './planning'
import { storyboardHash } from './hash'
import { requireStoryboardEnabled } from './policy'

interface PlanningInput { projectId: string, actor: MediaProjectActor, request: StoryboardPlanningRequest }
export interface CandidateResult {
  id: string
  candidateHash: string
  plan: StoryboardPlan
  findings: ReadinessFinding[]
  diff: ReturnType<typeof candidateDiff>
}
interface PlanningDependencies extends ReferenceDependencies {
  generate?: (prompt: string) => Promise<string>
  onDispatch?: () => Promise<void>
}
const conflict = () => createError({ statusCode: 409, statusMessage: 'Plan inputs changed or this operation cannot be retried. Refresh and use a new operation or manual plan.' })
const invalid = () => createError({ statusCode: 400, statusMessage: 'Invalid storyboard planning request' })
function parseRequest(value: unknown): StoryboardPlanningRequest {
  if (Buffer.byteLength(JSON.stringify(value) ?? '') > 512_000) throw invalid()
  const parsed = StoryboardPlanningRequestSchema.safeParse(value)
  if (!parsed.success) throw invalid()
  return parsed.data
}
async function currentFpsIn(db: Db, projectId: string): Promise<number> {
  const timeline = (await db.query(`SELECT t.state FROM media_projects p JOIN media_timelines t ON t.id=p.current_timeline_id AND t.project_id=p.id WHERE p.id=$1`, [projectId])).rows[0]
  const fps = timeline?.state?.fps
  if (!Number.isInteger(fps) || fps <= 0 || fps > 240) throw createError({ statusCode: 409, statusMessage: 'Save a valid project frame rate before planning.' })
  return fps
}

/** IDs only; source titles, directives, arbitrary URLs and metadata never enter model context. */
export async function buildStoryboardPlanningContextIn(db: Db, input: PlanningInput, revisionId: string, deps: ReferenceDependencies = {}): Promise<PlanningContext> {
  const project = await requireStoryboardProjectIn(db, input.projectId, input.actor)
  const saved = await getStoryboardIn(db, input.projectId, input.actor)
  if (!saved.storyboard || !saved.referenceSet || saved.storyboard.currentRevisionId !== input.request.expectedRevision
    || saved.referenceSet.id !== input.request.expectedReferenceSetRevisionId) throw conflict()
  const request = input.request
  let recipe: PlanningContext['recipe']
  try {
    recipe = request.recipe ? resolveStoryboardRecipe(request.recipe.id, request.recipe.version, request.recipe.values) : undefined
  } catch { throw invalid() }
  if (recipe && (recipe.resolvedValues.durationSeconds !== request.durationSeconds || recipe.resolvedValues.targetFormat !== request.targetFormat)) throw invalid()
  const inventory: PlanningContext['inventory'] = []
  const selected = new Map([...saved.referenceSet.references, ...request.assets].map(asset => [`${asset.sourceKind}:${asset.assetId}`, asset]))
  if (selected.size > 64) throw invalid()
  for (const asset of selected.values()) {
    const canonical = await canonicalReferenceIn(db, project, input.actor, asset.sourceKind, asset.assetId, deps)
    inventory.push({ sourceKind: asset.sourceKind, assetId: asset.assetId, contentHash: canonical.contentHash })
  }
  const fps = await currentFpsIn(db, project.id)
  return {
    projectId: project.id, storyboardId: saved.storyboard.id, referenceSetId: saved.referenceSet.id, revisionId,
    fps, durationFrames: request.durationSeconds * fps, targetFormat: request.targetFormat, inputMode: request.inputMode,
    copy: prepareStoryboardCopy(request.copy, saved.revision?.plan.copy ?? null), currentPlan: saved.revision?.plan ?? null,
    brief: request.method === 'ai' ? request.brief : '', recipe, inventory
  }
}
export function buildStoryboardPlanningContext(input: PlanningInput, deps: ReferenceDependencies = {}) {
  return transaction(db => buildStoryboardPlanningContextIn(db, input, randomUUID(), deps))
}

export async function reserveStoryboardCandidateIn(db: Db, raw: PlanningInput, deps: ReferenceDependencies = {}): Promise<{ result: CandidateResult } | { context: PlanningContext }> {
  const input = { ...raw, request: parseRequest(raw.request) }
  await requireStoryboardProjectIn(db, input.projectId, input.actor, true)
  const requestHash = storyboardHash({ projectId: input.projectId, actorId: input.actor.id, request: input.request })
  const prior = (await db.query('SELECT * FROM video_storyboard_candidates WHERE project_id=$1 AND operation_id=$2', [input.projectId, input.request.operationId])).rows[0]
  if (prior) {
    if (prior.request_hash !== requestHash || prior.status !== 'completed') throw conflict()
    return { result: prior.result }
  }
  const context = await buildStoryboardPlanningContextIn(db, input, randomUUID(), deps)
  await db.query(`INSERT INTO video_storyboard_candidates (id,project_id,operation_id,request_hash,base_revision_id,reference_set_id,status,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)`, [context.revisionId, input.projectId, input.request.operationId, requestHash, input.request.expectedRevision, context.referenceSetId, input.actor.id])
  return { context }
}

/** Recheck dependencies after inference; never advance the editable storyboard here. */
export async function assertPlanningContextIn(db: Db, input: PlanningInput, context: PlanningContext, deps: ReferenceDependencies = {}) {
  const root = (await db.query('SELECT current_revision_id,current_reference_set_id FROM video_storyboards WHERE project_id=$1', [input.projectId])).rows[0]
  if (!root || root.current_revision_id !== input.request.expectedRevision || root.current_reference_set_id !== context.referenceSetId) throw conflict()
  if (await currentFpsIn(db, input.projectId) !== context.fps) throw conflict()
  const project = await requireStoryboardProjectIn(db, input.projectId, input.actor)
  for (const asset of context.inventory) {
    const current = await canonicalReferenceIn(db, project, input.actor, asset.sourceKind, asset.assetId, deps)
    if (current.contentHash !== asset.contentHash) throw conflict()
  }
}

export async function createStoryboardPlan(raw: PlanningInput, deps: PlanningDependencies = {}): Promise<CandidateResult> {
  const input = { ...raw, request: parseRequest(raw.request) }
  const reserved = await transaction(db => reserveStoryboardCandidateIn(db, input, deps))
  if ('result' in reserved) return reserved.result
  const context = reserved.context
  try {
    let plan: StoryboardPlan
    if (input.request.method === 'manual') {
      plan = validateCandidate({ schemaVersion: 1, id: context.storyboardId, projectId: context.projectId, revision: context.revisionId,
        fps: context.fps, durationFrames: context.durationFrames, targetFormat: context.targetFormat, inputMode: context.inputMode,
        copyRevisionId: context.copy.id, copy: context.copy, referenceSetRevisionId: context.referenceSetId,
        ...(context.recipe ? { recipe: context.recipe } : {}), shots: input.request.shots }, context).plan
    } else {
      let dispatched = false
      plan = await createStoryboardCandidate(context, async (prompt) => {
        if (deps.event) requireStoryboardEnabled(deps.event)
        if (!dispatched) {
          await deps.onDispatch?.()
          dispatched = true
        }
        if (deps.generate) return deps.generate(prompt)
        const [{ generateModelRoutedGroqInsight }, { GROQ_MODELS }] = await Promise.all([import('~~/server/utils/ai/resolvedGroq'), import('~~/server/utils/groqClient')])
        return generateModelRoutedGroqInsight(prompt, {
          defaultModelId: GROQ_MODELS.LLAMA_70B, temperature: 0.1, maxTokens: 6000,
          featureKey: 'video_storyboard_planning', userId: input.actor.id, requestId: input.request.operationId,
          systemPrompt: STORYBOARD_SYSTEM_PROMPT,
          metadata: { route: '/api/agency/video/projects/:id/storyboard/plan', projectId: input.projectId, inventoryCount: context.inventory.length }
        })
      })
    }
    return await transaction(async (db) => {
      await requireStoryboardProjectIn(db, input.projectId, input.actor, true)
      if (deps.event) requireStoryboardEnabled(deps.event)
      await assertPlanningContextIn(db, input, context, deps)
      const saved = await getStoryboardIn(db, input.projectId, input.actor)
      const project = await requireStoryboardProjectIn(db, input.projectId, input.actor)
      const findings = [...validateCandidate(plan, context).findings, ...await checkReferencesIn(db, project, input.actor, saved.referenceSet!, deps)]
      const payload = { id: context.revisionId, plan, findings, diff: candidateDiff(context.currentPlan, plan) }
      const result: CandidateResult = { ...payload, candidateHash: storyboardHash(payload) }
      const changed = await db.query(`UPDATE video_storyboard_candidates SET status='completed',result=$1,finished_at=now() WHERE id=$2 AND project_id=$3 AND status='pending' RETURNING id`, [JSON.stringify(result), context.revisionId, input.projectId])
      if (!changed.rows[0]) throw conflict()
      return result
    })
  } catch (error) {
    // No provider bodies, prompts, brief or copy in failure storage/logging.
    await transaction(db => db.query(`UPDATE video_storyboard_candidates SET status='failed',finished_at=now() WHERE id=$1 AND project_id=$2 AND status='pending'`, [context.revisionId, input.projectId])).catch(() => {})
    throw error
  }
}

export async function acceptStoryboardCandidateIn(db: Db, input: StoryboardAcceptRequest & { projectId: string, actor: MediaProjectActor }, deps: ReferenceDependencies = {}) {
  const parsed = StoryboardAcceptRequestSchema.safeParse({ candidateId: input.candidateId, candidateHash: input.candidateHash, expectedRevision: input.expectedRevision, operationId: input.operationId, acceptChanges: input.acceptChanges, approveCopy: input.approveCopy })
  if (!parsed.success) throw invalid()
  await requireStoryboardProjectIn(db, input.projectId, input.actor, true)
  const candidate = (await db.query('SELECT * FROM video_storyboard_candidates WHERE project_id=$1 AND id=$2', [input.projectId, input.candidateId])).rows[0]
  if (!candidate || candidate.status !== 'completed' || candidate.result.candidateHash !== input.candidateHash || candidate.base_revision_id !== input.expectedRevision) throw conflict()
  const plan: StoryboardPlan = candidate.result.plan
  const replay = (await db.query('SELECT id FROM video_storyboard_revisions WHERE project_id=$1 AND operation_id=$2', [input.projectId, input.operationId])).rows[0]
  if (!replay && await currentFpsIn(db, input.projectId) !== plan.fps) throw conflict()
  // The core rechecks the active pointer, canonical assets, immutable copy and replay.
  return saveStoryboardRevisionIn(db, { projectId: input.projectId, actor: input.actor, expectedRevision: input.expectedRevision,
    operationId: input.operationId, plan, approveCopy: input.approveCopy, expectedCopyHash: plan.copy.contentHash }, deps)
}
