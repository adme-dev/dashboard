import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[a-f0-9]{64}$/
const OWNERSHIP_ACK = 'owned-disposable-nonpaid-t09'
const STAGES = ['references', 'plan', 'accept', 'apply', 'review']

function fail(message) {
  const error = new Error(message)
  error.safeMessage = message
  throw error
}

function requireCondition(condition, message) {
  if (!condition) fail(message)
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function requireUuid(value, label) {
  requireCondition(typeof value === 'string' && UUID.test(value), `${label} must be a UUID`)
  return value
}

function safeError(error) {
  return {
    name: typeof error?.name === 'string' ? error.name : 'Error',
    status: Number.isInteger(error?.status) ? error.status : Number.isInteger(error?.statusCode) ? error.statusCode : null,
    message: typeof error?.safeMessage === 'string' ? error.safeMessage : 'Adapter or canonical API request failed; response bodies were not logged.'
  }
}

export function validateStoryboardPilotConfig(input) {
  requireCondition(input && typeof input === 'object' && !Array.isArray(input), 'Config must be an object')
  const config = clone(input)
  requireCondition(config.schemaVersion === 1, 'Config schemaVersion must be 1')
  requireCondition(config.ownership === OWNERSHIP_ACK, `Config ownership must be ${OWNERSHIP_ACK}`)
  requireUuid(config.projectId, 'projectId')
  requireUuid(config.actorId, 'actorId')
  requireUuid(config.runId, 'runId')
  requireCondition(config.clientId === null || (typeof config.clientId === 'string' && UUID.test(config.clientId)), 'clientId must be null or a UUID')
  requireCondition(typeof config.ownedHost === 'string' && config.ownedHost.length > 0, 'ownedHost is required')
  let origin
  try {
    origin = new URL(config.origin)
  } catch {
    fail('origin must be an absolute HTTPS origin')
  }
  requireCondition(origin.protocol === 'https:', 'origin must use HTTPS')
  requireCondition(origin.origin === config.origin && !origin.username && !origin.password, 'origin must contain only the HTTPS scheme and owned host')
  requireCondition(origin.host === config.ownedHost, 'origin host must exactly match ownedHost')
  requireCondition(config.approveCopy === true, 'The operator must explicitly approve the exact manual copy')
  requireCondition(Array.isArray(config.references) && config.references.length <= 24, 'references must be an array of at most 24 entries')
  requireCondition(config.brandKit === null || typeof config.brandKit === 'object', 'brandKit must be null or a canonical reference')
  requireCondition(config.plan && typeof config.plan === 'object' && !Array.isArray(config.plan), 'plan is required')
  requireCondition(['idea', 'approved_script'].includes(config.plan.inputMode), 'plan.inputMode is invalid')
  requireCondition(Number.isInteger(config.plan.durationSeconds) && config.plan.durationSeconds >= 1 && config.plan.durationSeconds <= 120, 'plan.durationSeconds must be an integer from 1 to 120')
  requireCondition(['reels_9x16', 'square_1x1', 'youtube_16x9'].includes(config.plan.targetFormat), 'plan.targetFormat is invalid')
  requireCondition(config.plan.copy && Array.isArray(config.plan.copy.scriptSegments) && Array.isArray(config.plan.copy.cues), 'plan.copy must contain scriptSegments and cues')
  requireCondition(Array.isArray(config.plan.shots) && config.plan.shots.length >= 1 && config.plan.shots.length <= 24, 'plan.shots must contain 1 to 24 shots')
  requireCondition(new Set(config.plan.shots.map(shot => shot?.id)).size === config.plan.shots.length, 'plan shot IDs must be unique')
  for (const shot of config.plan.shots) requireUuid(shot?.id, 'shot ID')
  return config
}

export function storyboardPilotOperationId(runId, projectId, stage) {
  requireUuid(runId, 'runId')
  requireUuid(projectId, 'projectId')
  requireCondition(STAGES.includes(stage), 'Unknown operation stage')
  const digest = createHash('sha256').update(`video-storyboard-pilot-v1\0${runId}\0${projectId}\0${stage}`).digest('hex')
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}

function storyboardRoot(projectId) {
  return `/api/agency/video/projects/${projectId}/storyboard`
}

export function assertCanonicalStoryboardPilotRequest(request) {
  requireUuid(request?.projectId, 'request projectId')
  requireCondition(typeof request.path === 'string' && request.path.startsWith('/') && !request.path.includes('?') && !request.path.includes('#'), 'Request path must be a canonical path without query or fragment')
  const { method, path, projectId } = request
  const root = storyboardRoot(projectId)
  const applicationPath = path.startsWith(`${root}/applications/`) && UUID.test(path.slice(`${root}/applications/`.length))
  const allowed = (method === 'GET' && (path === `/api/agency/audio/projects/${projectId}` || path === root || path === `${root}/timeline-review` || applicationPath))
    || (method === 'PUT' && path === `${root}/references`)
    || (method === 'POST' && [`${root}/plan`, `${root}/revisions`, `${root}/resolve`, `${root}/apply`, `${root}/timeline-review`].includes(path))
  requireCondition(allowed, `Refusing noncanonical or provider-capable request: ${method} ${path}`)
}

function operationHeaders(config, stage) {
  return { 'Idempotency-Key': `video-storyboard-pilot:${config.runId}:${stage}` }
}

function newReceipt(config) {
  return {
    schemaVersion: 1,
    kind: 'video-storyboard-pilot-acceptance',
    status: 'running',
    runId: config.runId,
    origin: config.origin,
    projectId: config.projectId,
    actorId: config.actorId,
    configHash: hash(config),
    startedAt: new Date().toISOString(),
    initial: null,
    operations: Object.fromEntries(STAGES.map(stage => [stage, storyboardPilotOperationId(config.runId, config.projectId, stage)])),
    steps: {}
  }
}

function checkResumeReceipt(receipt, config) {
  if (!receipt) return newReceipt(config)
  requireCondition(receipt.schemaVersion === 1 && receipt.kind === 'video-storyboard-pilot-acceptance', 'Receipt schema is not supported')
  requireCondition(receipt.runId === config.runId && receipt.projectId === config.projectId && receipt.actorId === config.actorId && receipt.origin === config.origin, 'Receipt identity does not match this run')
  requireCondition(receipt.configHash === hash(config), 'Fixture changed; use a new runId and receipt instead of reusing operation IDs')
  requireCondition(receipt.initial || Object.keys(receipt.steps ?? {}).length === 0, 'Receipt has no durable initial timeline precondition')
  if (receipt.initial) requireCondition(UUID.test(receipt.initial.timelineId) && Number.isInteger(receipt.initial.editRevision), 'Receipt initial timeline precondition is invalid')
  return clone(receipt)
}

function findingsSummary(findings) {
  requireCondition(Array.isArray(findings), 'Canonical response findings must be an array')
  return findings.map(finding => ({ code: finding.code, severity: finding.severity, ...(finding.shotId ? { shotId: finding.shotId } : {}) }))
}

function assertNoBlockers(findings, label) {
  requireCondition(!findings.some(finding => finding?.severity === 'blocker'), `${label} has blocker findings`)
}

function checkProject(project, timeline, config, actorId) {
  requireCondition(actorId === config.actorId, 'Adapter session actor does not match config actorId')
  requireCondition(project?.id === config.projectId, 'Canonical project read returned a different project')
  requireCondition(project.createdBy === config.actorId, 'Project creator is not the authenticated owned-fixture actor')
  requireCondition(project.clientId === config.clientId, 'Project client does not match the owned fixture')
  requireCondition(project.mediaType === 'av' && project.status === 'draft', 'Pilot requires a draft AV project')
  requireCondition(timeline?.projectId === config.projectId && project.currentTimelineId === timeline.id, 'Project current timeline pointer is inconsistent')
  requireUuid(timeline.id, 'timeline ID')
  requireCondition(Number.isInteger(timeline.editRevision) && timeline.editRevision >= 0, 'Timeline editRevision is invalid')
  requireCondition(Number.isInteger(timeline.state?.fps) && timeline.state.fps > 0, 'Timeline FPS is invalid')
}

function checkApplication(receipt, config, initial, revisionId, resolvedTimeline) {
  requireCondition(receipt?.projectId === config.projectId && receipt.storyboardRevisionId === revisionId, 'Application project or storyboard revision mismatch')
  requireCondition(receipt.operationId === storyboardPilotOperationId(config.runId, config.projectId, 'apply'), 'Application operation ID mismatch')
  requireCondition(receipt.before?.timelineId === initial.timelineId && receipt.before?.editRevision === initial.editRevision, 'Application before precondition mismatch')
  requireCondition(UUID.test(receipt.after?.timelineId) && Number.isInteger(receipt.after?.editRevision) && receipt.after.editRevision > initial.editRevision, 'Application after revision is invalid')
  requireCondition(UUID.test(receipt.checkpointTimelineId) && Number.isInteger(receipt.checkpointVersion), 'Application checkpoint is missing')
  requireCondition(HASH.test(receipt.obligationHash), 'Application obligation hash is missing')
  requireCondition(isDeepStrictEqual(receipt.afterState, resolvedTimeline), 'Applied timeline differs from canonical resolution')
  for (const shot of config.plan.shots) requireCondition(Array.isArray(receipt.shotToClips?.[shot.id]), `Application has no clip mapping for shot ${shot.id}`)
}

function applicationEvidence(receipt) {
  return {
    id: receipt.id,
    operationId: receipt.operationId,
    storyboardRevisionId: receipt.storyboardRevisionId,
    before: clone(receipt.before),
    after: clone(receipt.after),
    checkpointTimelineId: receipt.checkpointTimelineId,
    checkpointVersion: receipt.checkpointVersion,
    obligationHash: receipt.obligationHash,
    afterStateHash: hash(receipt.afterState),
    shotToClips: clone(receipt.shotToClips),
    createdAt: receipt.createdAt
  }
}

export async function runStoryboardPilotAcceptance(input) {
  const config = validateStoryboardPilotConfig(input.config)
  const adapter = input.adapter
  requireCondition(adapter && typeof adapter.request === 'function', 'An authenticated root adapter with request() is required')
  const persist = input.persist ?? (async () => {})
  const emit = input.emit ?? (() => {})
  const receipt = checkResumeReceipt(input.receipt, config)
  receipt.status = 'running'
  delete receipt.failure
  let currentStep = 'preflight'

  async function save() {
    await persist(clone(receipt))
  }

  function event(type, detail = {}) {
    emit({ type, runId: config.runId, projectId: config.projectId, step: currentStep, ...detail })
  }

  async function call(method, path, body, stage) {
    const request = { projectId: config.projectId, method, path, ...(body === undefined ? {} : { body }), ...(stage ? { headers: operationHeaders(config, stage) } : {}) }
    assertCanonicalStoryboardPilotRequest(request)
    return adapter.request(request)
  }

  async function startStep(name, method, path, operationId) {
    currentStep = name
    if (receipt.steps[name]?.status === 'passed') return false
    receipt.steps[name] = { status: 'running', method, path, ...(operationId ? { operationId } : {}) }
    await save()
    event('step.started', { operationId })
    return true
  }

  async function passStep(name, result) {
    receipt.steps[name] = { ...receipt.steps[name], status: 'passed', result }
    await save()
    event('step.passed', { operationId: receipt.steps[name].operationId, result })
  }

  try {
    const projectPath = `/api/agency/audio/projects/${config.projectId}`
    const root = storyboardRoot(config.projectId)
    const [{ project, timeline }, saved] = await Promise.all([
      call('GET', projectPath),
      call('GET', root)
    ])
    checkProject(project, timeline, config, adapter.actorId)
    if (!receipt.initial) {
      requireCondition(saved.revision === null && saved.referenceSet === null && saved.application === null, 'Fresh run requires an unused disposable storyboard')
      requireCondition(Array.isArray(timeline.state?.tracks) && timeline.state.tracks.every(track => Array.isArray(track.clips) && track.clips.length === 0), 'Fresh run requires an empty timeline; replacement acceptance is a separate journey')
      receipt.initial = {
        timelineId: timeline.id,
        editRevision: timeline.editRevision,
        storyboardRevisionId: null,
        referenceSetRevisionId: null,
        fps: timeline.state.fps
      }
      receipt.project = { id: project.id, createdBy: project.createdBy, clientId: project.clientId, mediaType: project.mediaType, isTest: project.isTest === true }
      await save()
    }
    const initial = receipt.initial
    event('preflight.passed', { timelineId: initial.timelineId, editRevision: initial.editRevision })

    if (await startStep('references', 'PUT', `${root}/references`, receipt.operations.references)) {
      const body = {
        operationId: receipt.operations.references,
        expectedRevision: initial.referenceSetRevisionId,
        references: clone(config.references),
        brandKit: clone(config.brandKit)
      }
      const response = await call('PUT', `${root}/references`, body, 'references')
      const referenceSet = response?.referenceSet
      requireCondition(UUID.test(referenceSet?.id) && referenceSet.projectId === config.projectId && HASH.test(referenceSet.contentHash), 'Reference set response is invalid')
      await passStep('references', {
        referenceSetId: referenceSet.id,
        contentHash: referenceSet.contentHash,
        references: referenceSet.references.map(reference => ({ role: reference.role, sourceKind: reference.sourceKind, assetId: reference.assetId, contentHash: reference.contentHash, decision: reference.decision }))
      })
    }
    const referenceSetId = receipt.steps.references.result.referenceSetId

    if (await startStep('plan', 'POST', `${root}/plan`, receipt.operations.plan)) {
      const recipe = config.plan.recipe
        ? {
            ...clone(config.plan.recipe),
            values: { ...clone(config.plan.recipe.values), durationSeconds: config.plan.durationSeconds, targetFormat: config.plan.targetFormat }
          }
        : undefined
      const body = {
        operationId: receipt.operations.plan,
        expectedRevision: initial.storyboardRevisionId,
        expectedReferenceSetRevisionId: referenceSetId,
        method: 'manual',
        inputMode: config.plan.inputMode,
        durationSeconds: config.plan.durationSeconds,
        targetFormat: config.plan.targetFormat,
        copy: clone(config.plan.copy),
        assets: config.references.map(({ sourceKind, assetId }) => ({ sourceKind, assetId })),
        ...(recipe ? { recipe } : {}),
        shots: clone(config.plan.shots)
      }
      const candidate = await call('POST', `${root}/plan`, body, 'plan')
      requireCondition(UUID.test(candidate?.id) && HASH.test(candidate.candidateHash) && candidate.plan, 'Manual candidate response is invalid')
      requireCondition(candidate.plan.projectId === config.projectId && candidate.plan.referenceSetRevisionId === referenceSetId, 'Manual candidate identity mismatch')
      requireCondition(candidate.plan.durationFrames === config.plan.durationSeconds * initial.fps, 'Manual candidate frame total mismatch')
      requireCondition(isDeepStrictEqual(candidate.plan.shots, config.plan.shots), 'Manual candidate changed the supplied shots')
      requireCondition(isDeepStrictEqual({ scriptSegments: candidate.plan.copy?.scriptSegments, cues: candidate.plan.copy?.cues }, config.plan.copy), 'Manual candidate changed exact copy')
      await passStep('plan', { candidateId: candidate.id, candidateHash: candidate.candidateHash, findings: findingsSummary(candidate.findings), durationFrames: candidate.plan.durationFrames })
    }

    if (await startStep('accept', 'POST', `${root}/revisions`, receipt.operations.accept)) {
      const planStep = receipt.steps.plan.result
      const body = {
        operationId: receipt.operations.accept,
        expectedRevision: initial.storyboardRevisionId,
        candidateId: planStep.candidateId,
        candidateHash: planStep.candidateHash,
        acceptChanges: true,
        approveCopy: true
      }
      const response = await call('POST', `${root}/revisions`, body, 'accept')
      const revision = response?.revision
      requireCondition(revision?.id === planStep.candidateId && revision.projectId === config.projectId, 'Accepted revision identity mismatch')
      requireCondition(revision.plan?.referenceSetRevisionId === referenceSetId && revision.plan.copyRevisionId === revision.plan.copy?.id, 'Accepted revision dependency mismatch')
      requireCondition(revision.plan.copy.approval?.actorId === config.actorId && revision.plan.copy.approval.contentHash === revision.plan.copy.contentHash, 'Server copy approval is missing or belongs to another actor')
      requireCondition(isDeepStrictEqual(revision.plan.shots, config.plan.shots), 'Accepted revision changed the supplied shots')
      requireCondition(isDeepStrictEqual({ scriptSegments: revision.plan.copy.scriptSegments, cues: revision.plan.copy.cues }, config.plan.copy), 'Accepted revision changed exact copy')
      await passStep('accept', { revisionId: revision.id, planHash: hash(revision.plan), copyRevisionId: revision.plan.copy.id, copyHash: revision.plan.copy.contentHash, exactCopy: true, durationFrames: revision.plan.durationFrames })
    }
    const revisionId = receipt.steps.accept.result.revisionId

    let resolvedTimeline
    if (receipt.steps.apply?.status !== 'passed') {
      delete receipt.steps.resolve
      await startStep('resolve', 'POST', `${root}/resolve`)
      const body = { revisionId, formats: [config.plan.targetFormat] }
      const resolution = await call('POST', `${root}/resolve`, body)
      requireCondition(resolution?.ok === true && resolution.timeline, 'Canonical resolution is not ready')
      assertNoBlockers(resolution.findings, 'Canonical resolution')
      resolvedTimeline = resolution.timeline
      await passStep('resolve', { revisionId, findings: findingsSummary(resolution.findings), timelineHash: hash(resolution.timeline) })
    }

    if (await startStep('apply', 'POST', `${root}/apply`, receipt.operations.apply)) {
      const body = {
        operationId: receipt.operations.apply,
        revisionId,
        expectedTimelineId: initial.timelineId,
        expectedEditRevision: initial.editRevision,
        replaceConfirmed: false
      }
      let application
      let recovered = false
      try {
        application = await call('POST', `${root}/apply`, body, 'apply')
      } catch {
        application = await call('GET', `${root}/applications/${receipt.operations.apply}`).catch(() => null)
        requireCondition(application, 'Apply outcome remains unknown and no committed receipt was found; retry the same runId')
        recovered = true
      }
      checkApplication(application, config, initial, revisionId, resolvedTimeline)
      const replay = await call('POST', `${root}/apply`, body, 'apply')
      checkApplication(replay, config, initial, revisionId, resolvedTimeline)
      requireCondition(isDeepStrictEqual(replay, application), 'Same-operation apply returned a different receipt')
      const recoveredReceipt = await call('GET', `${root}/applications/${receipt.operations.apply}`)
      requireCondition(isDeepStrictEqual(recoveredReceipt, application), 'Application recovery returned a different receipt')
      await passStep('apply', { ...applicationEvidence(application), replayed: true, recovered: recovered || undefined })
      delete receipt.steps.resolve.resolvedTimeline
      await save()
    }

    if (await startStep('review', 'POST', `${root}/timeline-review`, receipt.operations.review)) {
      const application = receipt.steps.apply.result
      const preflight = await call('GET', `${root}/timeline-review`)
      requireCondition(preflight?.timelineId === application.after.timelineId && preflight.editRevision === application.after.editRevision && preflight.obligations, 'Timeline review precondition or obligations are missing')
      assertNoBlockers(preflight.findings, 'Timeline review')
      const body = {
        operationId: receipt.operations.review,
        expectedTimelineId: application.after.timelineId,
        expectedEditRevision: application.after.editRevision,
        obligationMappings: []
      }
      let reviewed
      try {
        reviewed = await call('POST', `${root}/timeline-review`, body, 'review')
      } catch {
        const current = await call('GET', `${root}/timeline-review`).catch(() => null)
        requireCondition(current?.review?.operationId === receipt.operations.review, 'Review outcome remains unknown; retry the same runId')
        reviewed = { timelineId: current.timelineId, editRevision: current.editRevision, review: current.review, findings: current.findings, id: current.review.id }
      }
      requireCondition(reviewed?.timelineId === application.after.timelineId && reviewed.editRevision === application.after.editRevision, 'Review timeline revision mismatch')
      requireCondition(UUID.test(reviewed.review?.id) && reviewed.review.operationId === receipt.operations.review && reviewed.id === reviewed.review.id, 'Timeline review receipt is invalid')
      assertNoBlockers(reviewed.findings, 'Timeline review result')
      const replay = await call('POST', `${root}/timeline-review`, body, 'review')
      requireCondition(isDeepStrictEqual(replay, reviewed), 'Same-operation review returned a different receipt')
      const readback = await call('GET', `${root}/timeline-review`)
      requireCondition(readback?.review?.id === reviewed.review.id && readback.review.operationId === receipt.operations.review, 'Timeline review readback is missing the durable receipt')
      await passStep('review', { id: reviewed.review.id, operationId: reviewed.review.operationId, timelineId: reviewed.timelineId, editRevision: reviewed.editRevision, replayed: true, noOpReview: true })
    }

    receipt.status = 'passed'
    receipt.finishedAt = new Date().toISOString()
    receipt.coverage = {
      manualPlan: true,
      canonicalReferences: true,
      canonicalResolve: true,
      atomicApply: true,
      sameOperationApplyReceipt: true,
      applicationRecoveryRead: true,
      noOpTimelineReviewReceipt: true,
      adjustedEditReview: false,
      renderInspection: false,
      physicalDeviceAcceptance: false,
      fullR1Accepted: false
    }
    currentStep = 'complete'
    await save()
    event('run.passed', { applicationId: receipt.steps.apply.result.id, reviewId: receipt.steps.review.result.id })
    return receipt
  } catch (error) {
    receipt.status = 'failed'
    receipt.failure = { step: currentStep, ...safeError(error) }
    await save()
    event('run.failed', { failure: receipt.failure })
    throw error
  }
}

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    requireCondition(['--config', '--adapter', '--receipt'].includes(key) && argv[index + 1], 'Usage: node scripts/video-storyboard-pilot-acceptance.mjs --config fixture.json --adapter /root-owned/adapter.mjs --receipt receipt.json')
    result[key.slice(2)] = argv[index + 1]
  }
  requireCondition(result.config && result.adapter && result.receipt, 'config, adapter and receipt are required')
  return result
}

async function readReceipt(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    fail('Existing receipt cannot be read; refusing to reuse operation IDs')
  }
}

async function writeReceipt(path, receipt) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const configPath = resolve(args.config)
  const receiptPath = resolve(args.receipt)
  const config = validateStoryboardPilotConfig(JSON.parse(await readFile(configPath, 'utf8')))
  const prior = await readReceipt(receiptPath)
  const adapterModule = await import(pathToFileURL(resolve(args.adapter)).href)
  requireCondition(typeof adapterModule.default === 'function', 'Adapter module must default-export an async factory')
  const adapter = await adapterModule.default({ origin: config.origin, projectId: config.projectId })
  try {
    await runStoryboardPilotAcceptance({
      config,
      adapter,
      receipt: prior,
      persist: receipt => writeReceipt(receiptPath, receipt),
      emit: event => console.log(JSON.stringify(event))
    })
  } finally {
    await adapter?.close?.()
  }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invoked) {
  main().catch((error) => {
    console.log(JSON.stringify({ type: 'run.failed', failure: safeError(error) }))
    process.exitCode = 1
  })
}
