import { randomUUID } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'

const core = vi.hoisted(() => ({ review: vi.fn(), reserve: vi.fn(), resources: vi.fn(), execution: vi.fn(), drafts: vi.fn(), destination: vi.fn(), catalogue: vi.fn(), forms: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/managedTransferIntent', () => ({ reviewManagedTransferSource: core.review, reserveManagedTransferIntent: core.reserve }))
vi.mock('~~/server/utils/pageStudio/managedTransferResources', () => ({ coordinateManagedTransferResources: core.resources }))
vi.mock('~~/server/utils/pageStudio/managedTransferExecution', () => ({ coordinateManagedTransferExecution: core.execution }))
vi.mock('~~/server/utils/pageStudio/managedTransferSourceDrafts', () => ({ coordinateManagedTransferSourceDrafts: core.drafts }))
vi.mock('~~/server/utils/pageStudio/managedTransferDestinationExecutionCoordinator', () => ({ coordinateManagedTransferDestinationExecution: core.destination }))
vi.mock('~~/server/utils/pageStudio/managedTransferDestinationCatalogueCoordinator', () => ({ coordinateManagedTransferDestinationCatalogue: core.catalogue }))
vi.mock('~~/server/utils/pageStudio/managedTransferFormsHistoryCoordinator', () => ({ coordinateManagedTransferFormsHistory: core.forms }))
const module = () => import('~~/workers/page-studio-management/src/managedTransferPreparation')
const reference = () => ({ operationId: randomUUID(), intentDigest: 'a'.repeat(64) })
const env = () => ({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production',
  PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), PAGE_STUDIO_CONTENT_ATTACHMENT_RUNTIME_DIGEST: 'c'.repeat(64),
  PAGE_STUDIO_CONTENT_ATTACHMENT_SCHEMA_DIGEST: 'd'.repeat(64),
  MANAGED_TRANSFER_EXECUTION_POLICY: 'source-policy',
  MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: JSON.stringify({ from: { compatibilityDate: '2026-09-07' } }) })
const run = vi.fn(async () => {
  throw new Error('Unexpected SQL')
})
beforeEach(() => vi.resetAllMocks())

it.each([
  ['resources', 'resources', 'resources-bound'], ['source-execution', 'execution', 'ready'],
  ['source-drafts', 'drafts', 'frozen'], ['destination-execution', 'destination', 'execution-verified'],
  ['destination-catalogue', 'catalogue', 'catalogue-verified'], ['forms-history', 'forms', 'ready']
] as const)('dispatches %s with the original reference and no automatic next step', async (phase, key, state) => {
  const request = { ...reference(), phase, action: 'status', expectedEnvironment: 'production' }
  core[key].mockResolvedValue({ operationId: request.operationId, state })
  const result = await (await module()).handleManagedTransferPreparation(request, env(), run)
  expect(result).toEqual({ ok: true, requestDigest: await collectionDigest(request), phase, value: { operationId: request.operationId, state } })
  expect(core[key].mock.calls[0][0]).toEqual({ operationId: request.operationId, intentDigest: request.intentDigest, action: 'status' })
  expect(Object.values(core).reduce((n, fn) => n + fn.mock.calls.length, 0)).toBe(1)
})

it.each(['start', 'resume', 'verify'])('preserves explicit %s without retries after an uncertain response', async (action) => {
  const request = { ...reference(), phase: 'source-execution', action, expectedEnvironment: 'production' }
  core.execution.mockRejectedValue(new Error('private credentials'))
  const result = await (await module()).handleManagedTransferPreparation(request, env(), run)
  expect(result).toMatchObject({ ok: false, error: { statusCode: 503 } })
  expect(core.execution).toHaveBeenCalledTimes(1)
  expect(core.execution.mock.calls[0][0].action).toBe(action)
  expect(JSON.stringify(result)).not.toContain('credentials')
})

it('keeps owner and operator inputs private and requires the reviewed source on reservation', async () => {
  const authority = { siteId: randomUUID(), entitlementId: randomUUID(), ownerLoginSessionHash: '1'.repeat(64), operator: { actorId: randomUUID(), loginSessionHash: '2'.repeat(64) } }
  const review = { sourceDigest: '3'.repeat(64), checkpointId: 'checkpoint', applicationId: randomUUID(), objectCount: 4 }
  core.review.mockResolvedValue(review)
  const m = await module()
  const reviewed = await m.handleManagedTransferPreparation({ phase: 'review', authority, expectedEnvironment: 'production' }, env(), run)
  expect(reviewed).toMatchObject({ ok: true, value: review })
  expect(core.review.mock.calls[0][0]).toEqual(authority)
  expect(JSON.stringify(reviewed)).not.toContain(authority.ownerLoginSessionHash)
  const request = { phase: 'reserve', operationId: randomUUID(), authority, expectedSourceDigest: review.sourceDigest, expectedEnvironment: 'production' }
  core.reserve.mockResolvedValue({ operationId: request.operationId, state: 'reserved', sourceDigest: review.sourceDigest, intentDigest: '4'.repeat(64), destinationGeneration: randomUUID() })
  expect(await m.handleManagedTransferPreparation(request, env(), run)).toMatchObject({ ok: true, value: { state: 'reserved' } })
  expect(core.reserve.mock.calls[0][0]).toEqual({ operationId: request.operationId, authority, expectedSourceDigest: review.sourceDigest })
})

it.each([
  { phase: 'finalize' }, { phase: 'source-drafts', action: 'verify' }, { action: 'publish' },
  { expectedEnvironment: 'staging' }, { databaseId: 'caller-selected' }, { authority: {} }, { operationId: 'invalid' }
])('rejects unsupported actions and caller-supplied authority or physical state %j', async (change) => {
  expect(await (await module()).handleManagedTransferPreparation({ ...reference(), phase: 'resources', action: 'start', expectedEnvironment: 'production', ...change }, env(), run)).toMatchObject({ ok: false, error: { statusCode: 400 } })
  expect(Object.values(core).every(fn => !fn.mock.calls.length)).toBe(true)
})

it.each(['PAGE_STUDIO_RELEASE_ENVIRONMENT', 'PAGE_STUDIO_PROVISIONING_ENVIRONMENT'])('denies wrong %s before running a phase', async (key) => {
  expect(await (await module()).handleManagedTransferPreparation({ ...reference(), phase: 'resources', action: 'start', expectedEnvironment: 'production' }, { ...env(), [key]: 'staging' }, run)).toMatchObject({ ok: false, error: { statusCode: 503 } })
  expect(core.resources).not.toHaveBeenCalled()
})

it('captures trusted config and RPC receivers before awaiting', async () => {
  const request = { ...reference(), phase: 'source-execution', action: 'start', expectedEnvironment: 'production' }
  const service = { readManagedTransferExecution: vi.fn(async function (this: unknown) {
    expect(this).toBe(service)
    return 'original'
  }) }
  const trusted = { ...env(), PAGE_STUDIO_PROVISIONER: service }
  const m = await module()
  core.execution.mockImplementation(async (_input, dependencies) => {
    expect(dependencies.env.MANAGED_TRANSFER_EXECUTION_POLICY).toBe('source-policy')
    expect(await dependencies.env.PAGE_STUDIO_PROVISIONER.readManagedTransferExecution()).toBe('original')
    return { operationId: request.operationId, state: 'ready' }
  })
  const pending = m.handleManagedTransferPreparation(request, trusted, run)
  request.intentDigest = 'e'.repeat(64)
  trusted.MANAGED_TRANSFER_EXECUTION_POLICY = 'changed'
  service.readManagedTransferExecution = vi.fn(async () => 'changed')
  expect(await pending).toMatchObject({ ok: true })
  expect(core.execution.mock.calls[0][0].intentDigest).toBe('a'.repeat(64))
})

it.each(['foreign', 'extra', 'wrong-phase'])('rejects %s progress without leaking its payload', async (kind) => {
  const request = { ...reference(), phase: 'resources', action: 'start', expectedEnvironment: 'production' }
  core.resources.mockResolvedValue({ operationId: kind === 'foreign' ? randomUUID() : request.operationId,
    state: kind === 'wrong-phase' ? 'frozen' : 'prepared', ...(kind === 'extra' ? { secret: 'private payload' } : {}) })
  const result = await (await module()).handleManagedTransferPreparation(request, env(), run)
  expect(result).toMatchObject({ ok: false, error: { statusCode: 503 } })
  expect(JSON.stringify(result)).not.toContain('private payload')
})

it('preserves denial while sanitizing internal errors', async () => {
  core.execution.mockRejectedValue({ statusCode: 403, message: 'private SQL' })
  const result = await (await module()).handleManagedTransferPreparation({ ...reference(), phase: 'source-execution', action: 'status', expectedEnvironment: 'production' }, env(), run)
  expect(result).toMatchObject({ ok: false, error: { statusCode: 403 } })
  expect(JSON.stringify(result)).not.toContain('SQL')
})
