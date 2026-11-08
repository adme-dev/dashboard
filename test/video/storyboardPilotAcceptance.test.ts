import { describe, expect, it } from 'vitest'
import {
  assertCanonicalStoryboardPilotRequest,
  runStoryboardPilotAcceptance,
  storyboardPilotOperationId,
  validateStoryboardPilotConfig
} from '../../scripts/video-storyboard-pilot-acceptance.mjs'
import { id, storyboardFixture } from './fixtures/storyboard'

const projectId = id(2)
const actorId = id(6)
const runId = id(100)
const referenceSetId = id(5)
const candidateId = id(101)
const timelineId = id(40)
const applicationId = id(102)
const reviewId = id(103)

function fixtureConfig() {
  const fixture = storyboardFixture()
  return {
    schemaVersion: 1,
    ownership: 'owned-disposable-nonpaid-t09',
    origin: 'https://owned.example.test',
    ownedHost: 'owned.example.test',
    projectId,
    actorId,
    clientId: null,
    runId,
    approveCopy: true,
    references: [{
      role: 'product',
      sourceKind: 'video_asset',
      assetId: id(20),
      expectedContentHash: 'b'.repeat(64),
      decision: 'approved',
      evidence: 'Owned synthetic fixture reviewed for this run.'
    }],
    brandKit: null,
    plan: {
      inputMode: fixture.inputMode,
      durationSeconds: 30,
      targetFormat: fixture.targetFormat,
      copy: { scriptSegments: fixture.copy.scriptSegments, cues: fixture.copy.cues },
      shots: fixture.shots
    }
  }
}

interface AdapterRequest {
  projectId: string
  method: string
  path: string
  body?: Record<string, unknown>
  headers?: Record<string, string>
}

function fakeAdapter(config: ReturnType<typeof fixtureConfig>, options: { loseApply?: boolean } = {}) {
  const requests: AdapterRequest[] = []
  let referenceSaved = false
  let revisionSaved = false
  let application: Record<string, unknown> | null = null
  let review: Record<string, unknown> | null = null
  let applyAttempts = 0
  const fixture = storyboardFixture()
  const candidatePlan = {
    ...fixture,
    projectId,
    revision: candidateId,
    referenceSetRevisionId: referenceSetId,
    copy: { ...fixture.copy, approval: null }
  }
  const acceptedPlan = {
    ...candidatePlan,
    copy: {
      ...fixture.copy,
      approval: { actorId, approvedAt: '2026-11-08T00:00:00.000Z', contentHash: fixture.copy.contentHash }
    }
  }
  const resolvedTimeline = {
    schema_version: 2,
    media_type: 'av',
    fps: 30,
    duration_sec: 30,
    tracks: [{ id: 'video', name: 'Video', kind: 'video', clips: [{ id: 'owned-clip', storyboard: { shotId: fixture.shots[0]!.id } }] }]
  }
  const shotToClips = Object.fromEntries(fixture.shots.map((shot, index) => [shot.id, [`owned-clip-${index}`]]))
  const root = `/api/agency/video/projects/${projectId}/storyboard`
  const adapter = {
    actorId,
    requests,
    async request(request: AdapterRequest) {
      requests.push(structuredClone(request))
      const { method, path } = request
      const body = request.body ?? {}
      if (method === 'GET' && path === `/api/agency/audio/projects/${projectId}`) {
        return {
          project: { id: projectId, createdBy: actorId, clientId: null, mediaType: 'av', status: 'draft', isTest: true, currentTimelineId: timelineId },
          timeline: { id: timelineId, projectId, editRevision: application ? 1 : 0, state: { fps: 30, tracks: [] } }
        }
      }
      if (method === 'GET' && path === root) {
        return { revision: revisionSaved ? { id: candidateId } : null, referenceSet: referenceSaved ? { id: referenceSetId } : null, application, readiness: [] }
      }
      if (method === 'PUT' && path === `${root}/references`) {
        referenceSaved = true
        return { referenceSet: {
          id: referenceSetId,
          projectId,
          contentHash: 'c'.repeat(64),
          references: config.references.map(reference => ({ ...reference, contentHash: reference.expectedContentHash }))
        } }
      }
      if (method === 'POST' && path === `${root}/plan`) {
        expect(body.method).toBe('manual')
        return { id: candidateId, candidateHash: 'd'.repeat(64), plan: candidatePlan, findings: [], diff: {} }
      }
      if (method === 'POST' && path === `${root}/revisions`) {
        revisionSaved = true
        return { revision: { id: candidateId, projectId, plan: acceptedPlan } }
      }
      if (method === 'POST' && path === `${root}/resolve`) return { ok: true, findings: [], timeline: resolvedTimeline }
      if (method === 'POST' && path === `${root}/apply`) {
        applyAttempts += 1
        application = {
          id: applicationId,
          projectId,
          operationId: body.operationId,
          storyboardRevisionId: candidateId,
          before: { timelineId, editRevision: 0 },
          after: { timelineId, editRevision: 1 },
          checkpointTimelineId: id(41),
          checkpointVersion: 1,
          afterState: resolvedTimeline,
          shotToClips,
          obligationHash: 'e'.repeat(64),
          createdAt: '2026-11-08T00:01:00.000Z'
        }
        if (options.loseApply && applyAttempts === 1) throw new Error('Simulated lost response after commit')
        return application
      }
      if (method === 'GET' && path === `${root}/applications/${storyboardPilotOperationId(runId, projectId, 'apply')}`) return application
      if (method === 'GET' && path === `${root}/timeline-review`) {
        return {
          timelineId,
          editRevision: 1,
          obligations: { cues: [], sources: [] },
          findings: [],
          review
        }
      }
      if (method === 'POST' && path === `${root}/timeline-review`) {
        review = { id: reviewId, operationId: body.operationId, createdAt: '2026-11-08T00:02:00.000Z' }
        return { id: reviewId, timelineId, editRevision: 1, review, findings: [] }
      }
      throw new Error(`Unexpected fixture request ${method} ${path}`)
    }
  }
  return adapter
}

describe('T09 owned nonpaid pilot acceptance runner', () => {
  it('fails closed before writes when host, actor, or project ownership does not match', async () => {
    const config = fixtureConfig()
    const adapter = fakeAdapter(config)
    const unownedAdapter = { ...adapter, actorId: id(999) }
    await expect(runStoryboardPilotAcceptance({ config, adapter: unownedAdapter })).rejects.toThrow('session actor')
    expect(adapter.requests.filter(request => request.method !== 'GET')).toEqual([])
    expect(() => validateStoryboardPilotConfig({ ...config, ownedHost: 'other.example.test' })).toThrow('ownedHost')
    expect(() => validateStoryboardPilotConfig({ ...config, ownership: 'unowned' })).toThrow('ownership')
  })

  it('allows only canonical storyboard/project routes and rejects provider submission endpoints', () => {
    expect(() => assertCanonicalStoryboardPilotRequest({ projectId, method: 'POST', path: '/api/agency/video/generation/jobs' })).toThrow('Refusing')
    expect(() => assertCanonicalStoryboardPilotRequest({ projectId, method: 'POST', path: `/api/agency/audio/projects/${projectId}/render-video` })).toThrow('Refusing')
    expect(() => assertCanonicalStoryboardPilotRequest({ projectId, method: 'POST', path: `/api/agency/video/projects/${projectId}/storyboard/plan` })).not.toThrow()
  })

  it('runs manual plan/reference/resolve/apply/review with exact IDs and idempotent receipts', async () => {
    const config = fixtureConfig()
    const adapter = fakeAdapter(config)
    const persisted: unknown[] = []
    const events: unknown[] = []
    const receipt = await runStoryboardPilotAcceptance({ config, adapter, persist: async value => persisted.push(value), emit: event => events.push(event) })
    expect(receipt.status).toBe('passed')
    expect(receipt.coverage).toMatchObject({ manualPlan: true, atomicApply: true, noOpTimelineReviewReceipt: true, adjustedEditReview: false, renderInspection: false, fullR1Accepted: false })
    expect(receipt.steps.apply.result).toMatchObject({ id: applicationId, operationId: storyboardPilotOperationId(runId, projectId, 'apply'), replayed: true, before: { timelineId, editRevision: 0 }, after: { timelineId, editRevision: 1 } })
    expect(receipt.steps.review.result).toMatchObject({ id: reviewId, operationId: storyboardPilotOperationId(runId, projectId, 'review'), replayed: true, noOpReview: true })
    expect(receipt.steps.resolve.resolvedTimeline).toBeUndefined()
    const applyCalls = adapter.requests.filter(request => request.method === 'POST' && request.path.endsWith('/apply'))
    expect(applyCalls).toHaveLength(2)
    expect(applyCalls[0].body).toEqual(applyCalls[1].body)
    expect(applyCalls[0].body).toMatchObject({ expectedTimelineId: timelineId, expectedEditRevision: 0, replaceConfirmed: false })
    expect(applyCalls[0].headers['Idempotency-Key']).toBe(applyCalls[1].headers['Idempotency-Key'])
    const reviewCalls = adapter.requests.filter(request => request.method === 'POST' && request.path.endsWith('/timeline-review'))
    expect(reviewCalls).toHaveLength(2)
    expect(reviewCalls[0].body).toEqual({ operationId: storyboardPilotOperationId(runId, projectId, 'review'), expectedTimelineId: timelineId, expectedEditRevision: 1, obligationMappings: [] })
    expect(adapter.requests.some(request => request.path.includes('generation') || request.path.includes('render'))).toBe(false)
    expect(persisted.at(-1)).toEqual(receipt)
    expect(events.at(-1)).toMatchObject({ type: 'run.passed', applicationId, reviewId })
  })

  it('recovers an ambiguous committed apply by its original operation ID before replay', async () => {
    const config = fixtureConfig()
    const adapter = fakeAdapter(config, { loseApply: true })
    const receipt = await runStoryboardPilotAcceptance({ config, adapter })
    expect(receipt.steps.apply.result).toMatchObject({ id: applicationId, recovered: true, replayed: true })
    expect(adapter.requests.filter(request => request.method === 'POST' && request.path.endsWith('/apply'))).toHaveLength(2)
  })

  it('resumes a completed durable receipt with reads only and rejects changed fixture bodies', async () => {
    const config = fixtureConfig()
    const adapter = fakeAdapter(config)
    const first = await runStoryboardPilotAcceptance({ config, adapter })
    const count = adapter.requests.length
    const resumed = await runStoryboardPilotAcceptance({ config, adapter, receipt: first })
    expect(resumed.steps.apply.result.id).toBe(applicationId)
    expect(adapter.requests.slice(count).every(request => request.method === 'GET')).toBe(true)
    await expect(runStoryboardPilotAcceptance({ config: { ...config, approveCopy: true, plan: { ...config.plan, durationSeconds: 15 } }, adapter, receipt: first })).rejects.toThrow('new runId')
    expect(adapter.requests.slice(count).every(request => request.method === 'GET')).toBe(true)
  })
})
