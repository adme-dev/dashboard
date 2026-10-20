import { randomUUID } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TransferWorkflowPhases } from '~~/shared/pageStudio/transferWorkflow'

const mocks = vi.hoisted(() => ({ control: vi.fn(), preparation: vi.fn(), admission: vi.fn(), execution: vi.fn(), completion: vi.fn(), authority: vi.fn(), retained: vi.fn(), copyProof: vi.fn(), formsProof: vi.fn() }))
vi.mock('~~/workers/page-studio-management/src/transferControls', () => ({ withReservedTransferControl: mocks.control }))
vi.mock('~~/workers/page-studio-management/src/managedTransferPreparation', async original => ({ ...await original<object>(), handleManagedTransferPreparation: mocks.preparation }))
vi.mock('~~/workers/page-studio-management/src/managedTransferCopyManagement', () => ({ handleManagedTransferCopyManagement: mocks.admission }))
vi.mock('~~/workers/page-studio-management/src/managedTransferCopyExecutionManagement', () => ({ handleManagedTransferCopyExecutionManagement: mocks.execution }))
vi.mock('~~/workers/page-studio-management/src/completedManagedTransferManagement', () => ({ handleManagedTransferFinalization: mocks.completion }))
vi.mock('~~/server/utils/pageStudio/managedTransferIntent', async original => ({ ...await original<object>(), withManagedTransferIntentAuthority: mocks.authority, withReservedManagedTransfer: mocks.authority }))
vi.mock('~~/server/utils/pageStudio/managedTransferCompletionRead', () => ({ retainedManagedTransferCompletion: mocks.retained }))
vi.mock('~~/workers/page-studio-management/src/managedTransferCopyCoordinator', () => ({ readVerifiedCopyGraph: mocks.copyProof }))
vi.mock('~~/server/utils/pageStudio/managedTransferFormsHistoryCoordinator', () => ({ retainedManagedTransferFormsHistoryVerification: mocks.formsProof }))
const reference = { operationId: randomUUID(), intentDigest: 'a'.repeat(64) }
const request = { siteId: randomUUID(), requestId: randomUUID(), expectedRevision: 5,
  operator: { actorId: randomUUID(), loginSessionHash: 'b'.repeat(64) }, expectedEnvironment: 'production' }
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
const run = vi.fn(async () => {
  throw new Error('Unexpected SQL')
})
const handle = async (input: unknown, config = env) => (await import('~~/workers/page-studio-management/src/transferWorkflow')).handleTransferWorkflow(input, config, run)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.control.mockImplementation(async (_input, work) => work(reference))
  mocks.authority.mockImplementation(async (_input, work) => work({}, {}))
  mocks.retained.mockResolvedValue(null)
  const progress = async (input: { phase?: string, operationId: string }) => ({ ok: true, requestDigest: await collectionDigest(input),
    ...(input.phase ? { phase: input.phase } : {}), value: { operationId: input.operationId, state: 'not-started' } })
  mocks.preparation.mockImplementation(progress)
  mocks.admission.mockImplementation(progress)
  mocks.execution.mockImplementation(progress)
})
it('reads nine phases in fixed order without reserving, finalizing or advancing', async () => {
  const input = { ...request, action: 'status' }
  const result = await handle(input)
  expect(result).toMatchObject({ ok: true, requestDigest: await collectionDigest(input), value: { requestId: request.requestId, revision: 5 } })
  if (!result.ok) throw new Error('Expected status')
  expect(result.value.phases.map(p => p.phase)).toEqual(TransferWorkflowPhases)
  expect(mocks.preparation.mock.calls.map(args => args[0].action)).toEqual(Array(6).fill('status'))
  expect(mocks.admission.mock.calls[0][0].action).toBe('read')
  expect(mocks.execution.mock.calls[0][0].action).toBe('status')
  expect(mocks.completion).not.toHaveBeenCalled()
  expect(JSON.stringify(result)).not.toContain(reference.operationId)
  expect(JSON.stringify(result)).not.toContain(reference.intentDigest)
  expect(mocks.control.mock.calls[0][0]).toEqual({ siteId: request.siteId, requestId: request.requestId, expectedRevision: 5, operator: request.operator })
})
it.each([
  ['resources', 'start', 'preparation'], ['source-execution', 'verify', 'preparation'], ['source-drafts', 'resume', 'preparation'],
  ['destination-catalogue', 'start', 'preparation'], ['destination-execution', 'resume', 'preparation'],
  ['copy-admission', 'prepare', 'admission'], ['copy-execution', 'verify', 'execution'], ['forms-history', 'verify', 'preparation']
] as const)('dispatches only explicit %s/%s under retained request authority', async (phase, action, key) => {
  const result = await handle({ ...request, phase, action })
  expect(result).toMatchObject({ ok: true, value: { phases: [{ phase, state: 'not-started' }] } })
  expect(mocks[key]).toHaveBeenCalledTimes(1)
  expect(mocks[key].mock.calls[0][0]).toMatchObject({ ...reference, action })
  expect([mocks.preparation, mocks.admission, mocks.execution, mocks.completion].reduce((n, fn) => n + fn.mock.calls.length, 0)).toBe(1)
})
it.each([
  { phase: 'source-drafts', action: 'verify' }, { phase: 'copy-execution', action: 'authorize' },
  { phase: 'copy-admission', action: 'start' }, { phase: 'completion', action: 'verify' },
  { phase: 'resources', action: 'start', operationId: reference.operationId },
  { phase: 'resources', action: 'start', intentDigest: reference.intentDigest },
  { phase: 'resources', action: 'start', payload: {} }, { action: 'status', phase: 'resources' }
])('rejects unsupported actions or public authority fields %j', async (change) => {
  expect(await handle({ ...request, ...change })).toMatchObject({ ok: false, error: { statusCode: 400 } })
  expect(mocks.control).not.toHaveBeenCalled()
})
it('reports missing prerequisites as unavailable, never falsely complete', async () => {
  mocks.preparation.mockImplementation(async input => ({ ok: false, requestDigest: await collectionDigest(input), error: { statusCode: 409, message: 'private prerequisites' } }))
  const result = await handle({ ...request, action: 'status' })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Expected status')
  expect(result.value.phases[0]).toEqual({ phase: 'resources', state: 'unavailable', allowedActions: [] })
  expect(result.value.phases.at(-1)?.state).toBe('not-started')
  expect(JSON.stringify(result)).not.toContain('private prerequisites')
})
it.each(['digest', 'identity', 'phase', 'payload'])('rejects mismatched %s acknowledgements', async (kind) => {
  mocks.preparation.mockImplementation(async input => ({ ok: true, requestDigest: kind === 'digest' ? 'c'.repeat(64) : await collectionDigest(input),
    phase: kind === 'phase' ? 'forms-history' : input.phase, value: { operationId: kind === 'identity' ? randomUUID() : input.operationId,
      state: 'ready', ...(kind === 'payload' ? { secret: 'private SQL' } : {}) } }))
  expect(await handle({ ...request, phase: 'source-execution', action: 'start' })).toMatchObject({ ok: false, error: { statusCode: 503 } })
  expect(mocks.preparation).toHaveBeenCalledTimes(1)
})
it('does not retry an uncertain mutation or replace its request identity', async () => {
  mocks.execution.mockRejectedValue(new Error('private provider credentials'))
  const result = await handle({ ...request, phase: 'copy-execution', action: 'resume' })
  expect(result).toMatchObject({ ok: false, error: { statusCode: 503 } })
  expect(mocks.execution).toHaveBeenCalledTimes(1)
  expect(mocks.control.mock.calls[0][0].requestId).toBe(request.requestId)
  expect(JSON.stringify(result)).not.toContain('credentials')
})
it.each([403, 409])('withholds results when original authority revalidation rejects with %s', async (statusCode) => {
  mocks.control.mockImplementation(async (_input, work) => {
    await work(reference)
    throw { statusCode }
  })
  expect(await handle({ ...request, phase: 'resources', action: 'start' })).toMatchObject({ ok: false, error: { statusCode } })
  expect(mocks.preparation).toHaveBeenCalledTimes(1)
})
it('rejects expired original sessions before any phase and keeps no substitute authority', async () => {
  mocks.control.mockRejectedValue({ statusCode: 403 })
  expect(await handle({ ...request, action: 'status' })).toMatchObject({ ok: false, error: { statusCode: 403 } })
  expect(mocks.preparation).not.toHaveBeenCalled()
})
it('fails closed outside production', async () => {
  expect(await handle({ ...request, action: 'status' }, { ...env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' })).toMatchObject({ ok: false, error: { statusCode: 503 } })
  expect(mocks.control).not.toHaveBeenCalled()
})

it('offers completion only after valid retained copy and Forms history proofs', async () => {
  const first = await handle({ ...request, action: 'status' })
  expect(first.ok && first.value.phases.at(-1)?.allowedActions).toEqual([])
  mocks.copyProof.mockResolvedValue({ verified: true })
  mocks.formsProof.mockResolvedValue({ verified: true })
  const ready = await handle({ ...request, action: 'status' })
  expect(ready.ok && ready.value.phases.at(-1)?.allowedActions).toEqual(['complete'])
  expect(mocks.completion).not.toHaveBeenCalled()
})
it('validates completion receipt identity and digest on the explicit terminal action', async () => {
  const fixture = await (await import('../helpers/pageStudio/managedTransferCompletion')).completionReceiptFixture()
  const { digest: _digest, ...body } = { ...fixture, ...reference }
  const receipt = { ...body, digest: await collectionDigest(body) }
  mocks.completion.mockImplementation(async input => ({ ok: true, requestDigest: await collectionDigest(input), value: receipt }))
  const result = await handle({ ...request, phase: 'completion', action: 'complete' })
  expect(result).toMatchObject({ ok: true, value: { phases: [{ phase: 'completion', state: 'completed', allowedActions: [] }] } })
  expect(mocks.completion).toHaveBeenCalledTimes(1)
  expect(mocks.preparation).not.toHaveBeenCalled()
  mocks.completion.mockImplementation(async input => ({ ok: true, requestDigest: await collectionDigest(input), value: fixture }))
  expect(await handle({ ...request, phase: 'completion', action: 'complete' })).toMatchObject({ ok: false, error: { statusCode: 503 } })
})
