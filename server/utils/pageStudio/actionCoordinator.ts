import { z } from 'zod'
import {
  collectionCanonical,
  collectionDigest
} from '~~/shared/pageStudio/collectionApi'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import {
  BuilderArtifactPinSchema,
  CmsPreparationSchema,
  CmsNativeCommitSchema,
  contentScopeKey
} from '~~/shared/pageStudio/cmsManaged'
import {
  ActionInvocationRequestSchema,
  ActionInvocationContextSchema,
  BuilderActionResultEnvelopeSchema,
  BuilderActionResultPinSchema,
  builderActionResultKey
} from '~~/shared/pageStudio/actionInvocation'
import {
  verifyBuilderActionInput,
  inspectBuilderActionEffectTargets,
  parseBuilderActionRuntimeResultJson
} from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { withCmsCommitAuthority } from './cmsCommitAuthority'
import {
  cmsEqual,
  cmsUnavailable,
  lockCmsContext,
  readAcceptedCmsObject,
  listAcceptedCmsRecords,
  decodeCmsObject
} from './cmsVisibility'
import {
  admitActionInvocation,
  acknowledgeActionResult,
  readActionInvocation,
  pinActionEffects,
  commitActionInvocation,
  lookupActionInvocation,
  projectActionInvocationData
} from './actionInvocations'
import { createActionStorage } from './actionStorage'
import type { PageStudioControlQueryClient } from './controlStore'

type Principal = Extract<
  Parameters<typeof withCmsCommitAuthority>[0]['principal'],
  { source: 'studio-session' }
>
type RunTransaction = <T>(
  work: (db: PageStudioControlQueryClient) => Promise<T>
) => Promise<T>
const BROKER = 'page-studio-sandbox'
const RUNTIME
  = 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e'
const Start = z
  .object({
    intentId: z.uuid(),
    action: BuilderArtifactPinSchema.extend({
      kind: z.literal('action')
    }).strict(),
    input: z.unknown()
  })
  .strict()
export const ActionControlRequestSchema = z.discriminatedUnion('phase', [
  Start.extend({ phase: z.literal('prepare') }).strict(),
  z
    .object({
      phase: z.literal('admit'),
      request: ActionInvocationRequestSchema,
      input: z.unknown()
    })
    .strict(),
  z
    .object({
      phase: z.literal('acknowledge'),
      request: ActionInvocationRequestSchema
    })
    .strict(),
  z
    .object({
      phase: z.literal('complete'),
      request: ActionInvocationRequestSchema,
      input: z.unknown()
    })
    .strict()
])
interface Dependencies {
  runTransaction?: RunTransaction
}
const scopeFor = (principal: Principal) =>
  PageStudioContentScopeSchema.parse({
    tenantId: principal.claims.tenantId,
    clientId: principal.claims.clientId,
    businessId: principal.claims.clientId,
    siteId: principal.claims.siteId,
    environment: principal.env.PAGE_STUDIO_CONTENT_ENVIRONMENT
  })
const boundedInput = (value: unknown) =>
  parseBuilderActionRuntimeResultJson(collectionCanonical(value))
function publicStatus(
  value: { state: string, receipt?: unknown, current?: boolean },
  output?: unknown
) {
  return {
    state: value.state,
    ...(value.current === undefined ? {} : { current: value.current }),
    ...(output === undefined ? {} : { output })
  }
}
async function currentBase(
  principal: Principal,
  action: unknown,
  dependencies: Dependencies
) {
  const scope = scopeFor(principal)
  return withCmsCommitAuthority(
    { scope, principal, mutation: 'action-execution' },
    async (db) => {
      const context = await lockCmsContext(db, scope)
      if (
        !context.application.manifest.actions.some(pin =>
          cmsEqual(pin, action)
        )
      )
        throw cmsUnavailable()
      const content = context.state.current_content_id
        ? await readAcceptedCmsObject(db, { scope, kind: 'content' })
        : null
      return { context, content }
    },
    dependencies
  )
}
async function discover(
  raw: z.infer<typeof Start>,
  principal: Principal,
  dependencies: Dependencies
) {
  const scope = scopeFor(principal),
    input = boundedInput(raw.input),
    inputDigest = await collectionDigest(input)
  const retained = await lookupActionInvocation(
    { ...raw, inputDigest },
    principal,
    { ...dependencies, brokerId: BROKER }
  )
  if (retained) return { request: retained.request, input, retained }
  const initial = await currentBase(principal, raw.action, dependencies)
  const storage = createActionStorage(
    principal.env,
    scope,
    initial.context.state.target
  )
  const artifactBytes = await storage.readArtifact(raw.action)
  const verified = await verifyBuilderActionInput({
    scope,
    actionPin: raw.action,
    artifactBytes,
    input
  })
  const context = await withCmsCommitAuthority(
    { scope, principal, mutation: 'action-execution' },
    async (db) => {
      const state = await lockCmsContext(db, scope)
      if (
        !state.application.manifest.actions.some(pin =>
          cmsEqual(pin, raw.action)
        )
        || !cmsEqual(state.state.target, initial.context.state.target)
      )
        throw cmsUnavailable()
      const pins = [
        ...new Map(
          [
            ...verified.collections.map(binding => binding.collection),
            ...(verified.effects?.permissions.map(
              permission => permission.collection
            ) ?? [])
          ].map(pin => [pin.id, pin])
        ).values()
      ]
      const expectedSchemas = []
      for (const pin of pins)
        expectedSchemas.push(
          (
            await readAcceptedCmsObject(db, {
              scope,
              kind: 'schema',
              collectionId: pin.id
            })
          ).pin
        )
      const records = new Map<
        string,
        {
          collectionId: string
          recordId: string
          base: (typeof expectedSchemas)[number]
        }
      >()
      for (const binding of verified.collections) {
        const page = await listAcceptedCmsRecords(db, {
          scope,
          collectionId: binding.collection.id,
          limit: binding.limit
        })
        for (const item of page.items)
          records.set(
            collectionCanonical([item.pin.collectionId, item.pin.recordId]),
            {
              collectionId: item.pin.collectionId,
              recordId: item.pin.recordId,
              base: item.pin
            }
          )
      }
      const content = state.state.current_content_id
        ? await readAcceptedCmsObject(db, { scope, kind: 'content' })
        : null
      return ActionInvocationContextSchema.parse({
        formatVersion: 1,
        scope,
        generation: state.state.active_generation,
        target: state.state.target,
        freezeDigest: state.state.freeze_digest,
        expectedApplication: {
          id: state.application.id,
          digest: state.application.digest
        },
        expectedCheckpoint: state.application.manifest.checkpoint,
        expectedContent: content?.pin ?? null,
        expectedSchemas,
        expectedRecords: [...records.values()],
        action: raw.action,
        runtimeDigest: RUNTIME,
        inputDigest,
        dataDigest: 'a'.repeat(64)
      })
    },
    dependencies
  )
  const projected = await projectActionInvocationData(
    context,
    principal,
    verified,
    { ...dependencies, readObject: storage.readObject }
  )
  const request = ActionInvocationRequestSchema.parse({
    intentId: raw.intentId,
    context: { ...context, dataDigest: await collectionDigest(projected.data) }
  })
  return { request, input, retained: null, artifactBytes }
}
async function originalActor(principal: Principal, dependencies: Dependencies) {
  return withCmsCommitAuthority(
    { scope: scopeFor(principal), principal, mutation: 'action-execution' },
    async (db) => {
      const rows = (
        await db.query<{ login_session_hash: string }>(
          'SELECT login_session_hash FROM page_studio_sessions WHERE nonce=$1 AND user_id=$2 AND role=$3',
          [
            principal.claims.nonce,
            principal.claims.userId,
            principal.claims.role
          ]
        )
      ).rows
      if (rows.length !== 1) throw cmsUnavailable()
      return {
        kind:
          principal.claims.role === 'agency' ? 'agency-user' : 'client-user',
        userId: principal.claims.userId,
        loginSessionHash: rows[0]!.login_session_hash
      }
    },
    dependencies
  )
}
async function complete(
  request: z.infer<typeof ActionInvocationRequestSchema>,
  input: unknown,
  principal: Principal,
  dependencies: Dependencies
) {
  const context = request.context
  const retained = await lookupActionInvocation(
    {
      intentId: request.intentId,
      action: context.action,
      inputDigest: await collectionDigest(boundedInput(input))
    },
    principal,
    { ...dependencies, brokerId: BROKER }
  )
  if (!retained || !cmsEqual(retained.request, request)) throw cmsUnavailable()
  const storage = createActionStorage(
    principal.env,
    context.scope,
    context.target
  )
  const saved = await readActionInvocation(request, principal, {
    ...dependencies,
    brokerId: BROKER
  })
  if (saved.state === 'execution_failed' || saved.state === 'rejected')
    return publicStatus(saved)
  if (saved.state === 'dispatch_claimed') return { state: 'unresolved' }
  const bytes = await storage.readResult(
    await builderActionResultKey(saved.execution)
  )
  const envelope = BuilderActionResultEnvelopeSchema.parse(JSON.parse(bytes))
  if (
    !cmsEqual(envelope.execution, saved.execution)
    || collectionCanonical(envelope) !== bytes
    || envelope.result.status !== 'ok'
    || envelope.result.json === undefined
  )
    throw cmsUnavailable()
  const artifactBytes = await storage.readArtifact(context.action)
  const inspected = await inspectBuilderActionEffectTargets({
    scope: context.scope,
    actionPin: context.action,
    artifactBytes,
    resultBytes: envelope.result.json
  })
  if (saved.state === 'committed') {
    const receipt = z
      .object({
        outputDigest: z.string(),
        result: BuilderActionResultPinSchema
      })
      .passthrough()
      .parse(saved.receipt)
    if (
      receipt.result.sha256 !== (await collectionDigest(envelope))
      || receipt.result.bytes !== new TextEncoder().encode(bytes).byteLength
      || receipt.result.key !== (await builderActionResultKey(saved.execution))
    )
      throw cmsUnavailable()
    if ((await collectionDigest(inspected.result)) !== receipt.outputDigest)
      throw cmsUnavailable()
    const current = await readActionInvocation(request, principal, {
      ...dependencies,
      brokerId: BROKER
    })
    if (
      current.state !== 'committed'
      || !cmsEqual(current.receipt, saved.receipt)
    )
      throw cmsUnavailable()
    return publicStatus(current, inspected.result)
  }
  const effectContext = retained.effectIdentity
    ? z
      .object({ context: ActionInvocationContextSchema })
      .passthrough()
      .parse(retained.effectIdentity).context
    : await withCmsCommitAuthority(
        { scope: context.scope, principal, mutation: 'action-execution' },
        async (db) => {
          const state = await lockCmsContext(db, context.scope),
            records = []
          for (const target of inspected.targets) {
            const rows = (
              await db.query(
                `SELECT o.* FROM page_studio_cms_record_heads h JOIN page_studio_cms_objects o ON o.scope_key=h.scope_key AND o.generation=h.generation AND o.id=h.object_id WHERE h.scope_key=$1 AND h.generation=$2 AND h.collection_id=$3 AND h.record_id=$4`,
                [
                  contentScopeKey(context.scope),
                  context.generation,
                  target.collectionId,
                  target.recordId
                ]
              )
            ).rows
            if (rows.length > 1) throw cmsUnavailable()
            records.push({
              collectionId: target.collectionId,
              recordId: target.recordId,
              base: rows[0] ? decodeCmsObject(rows[0], state).pin : null
            })
          }
          return ActionInvocationContextSchema.parse({
            ...context,
            expectedRecords: records
          })
        },
        dependencies
      )
  const deps = {
    ...dependencies,
    brokerId: BROKER,
    input,
    readArtifact: async () => artifactBytes,
    readResult: storage.readResult,
    readObject: storage.readObject
  }
  const pinned = await pinActionEffects(
    request,
    effectContext,
    principal,
    deps
  )
  let commit: unknown
  if (pinned.items.length) {
    const prepared = CmsPreparationSchema.parse({
      formatVersion: 1,
      scope: context.scope,
      actor: await originalActor(principal, dependencies),
      candidateDigest: null,
      action: context.action,
      freezeDigest: context.freezeDigest,
      operationId: `action_${request.intentId}`,
      items: pinned.items
    })
    const receipt = await storage.prepare(prepared)
    const {
      action: _action,
      runtimeDigest: _runtime,
      inputDigest: _input,
      dataDigest: _data,
      ...base
    } = effectContext
    commit = CmsNativeCommitSchema.parse({
      ...base,
      operationId: prepared.operationId,
      preparedDigest: receipt.digest,
      preparedRequestDigest: receipt.requestDigest
    })
  }
  const outputDigest = await collectionDigest(pinned.output)
  const finished = await commitActionInvocation(request, principal, {
    ...deps,
    ...(commit ? { commit, readPreparation: storage.readPreparation } : {})
  })
  const state = z
    .object({
      receipt: z.object({ outputDigest: z.string() }).passthrough(),
      current: z.boolean()
    })
    .passthrough()
    .parse(finished)
  if (state.receipt.outputDigest !== outputDigest) throw cmsUnavailable()
  return { state: 'committed', current: state.current, output: pinned.output }
}
/** Machine+original Studio child ingress calls this only after authentication.
 * Browser callers receive the separate public status projection, never grants. */
export async function coordinateActionInvocation(
  raw: unknown,
  principal: Principal,
  dependencies: Dependencies = {}
) {
  const body = ActionControlRequestSchema.parse(raw)
  if (body.phase === 'prepare') {
    const { phase: _phase, ...start } = body
    const value = await discover(start, principal, dependencies)
    if (value.retained?.state === 'committed')
      return {
        kind: 'status',
        status: await complete(
          value.request,
          value.input,
          principal,
          dependencies
        )
      }
    if (
      value.retained?.state === 'execution_failed'
      || value.retained?.state === 'rejected'
    )
      return { kind: 'status', status: publicStatus(value.retained) }
    const storage = createActionStorage(
      principal.env,
      value.request.context.scope,
      value.request.context.target
    )
    return {
      kind: 'prepared',
      request: value.request,
      input: value.input,
      artifactBytes:
        value.artifactBytes
        ?? (await storage.readArtifact(value.request.context.action))
    }
  }
  const scope = scopeFor(principal)
  if (contentScopeKey(body.request.context.scope) !== contentScopeKey(scope))
    throw cmsUnavailable()
  const storage = createActionStorage(
    principal.env,
    scope,
    body.request.context.target
  )
  const deps = {
    ...dependencies,
    brokerId: BROKER,
    readArtifact: () => storage.readArtifact(body.request.context.action),
    readObject: storage.readObject,
    readResult: storage.readResult
  }
  if (body.phase === 'admit')
    return admitActionInvocation(body.request, principal, {
      ...deps,
      input: body.input
    })
  if (body.phase === 'acknowledge')
    return acknowledgeActionResult(body.request, principal, deps)
  return complete(body.request, body.input, principal, dependencies)
}
