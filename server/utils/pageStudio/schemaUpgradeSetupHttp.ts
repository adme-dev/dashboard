import { createError, getRouterParam, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { requireAgencyPageStudioAccess } from './access'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import {
  PageStudioBusinessContentError,
  type PageStudioContentActor
} from './businessContent'
import { readContentBody } from './businessContentHttp'
import { authorizePageStudioCollections } from './collections'
import type { createSchemaUpgradePreparation } from './schemaUpgradeIntent'
import type { createSchemaUpgradeAuthority } from './schemaUpgradeAuthority'
import { requirePageStudioProvisioningRuntime } from './provisioningBinding'
import type { SchemaUpgradeContract } from './schemaUpgradeContract'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { pageStudioHttpError } from './http'

export function createSchemaUpgradeSetup(contract: SchemaUpgradeContract, prepare: ReturnType<typeof createSchemaUpgradePreparation>, authorize: ReturnType<typeof createSchemaUpgradeAuthority>['authorize']) {
  const pending = () =>
    new PageStudioBusinessContentError(
      contract.pendingCode,
      503,
      contract.pendingMessage
    )
  const Receipt = contract.receiptSchema
  function expectedReceipt(input: unknown) {
    const operation = contract.schema.parse(input)
    const { actor: _actor, version: _version, policyVersion: _policy, ...receipt } = operation
    return Receipt.parse(receipt)
  }
  const Body = z.object({ requestId: z.string().uuid() }).strict()
  return async function handleSchemaUpgradeSetup(
    event: H3Event,
    audience: 'agency' | 'portal',
    method: 'GET' | 'POST'
  ) {
    setHeader(event, 'cache-control', 'private, no-store')
    try {
      let actor: PageStudioContentActor
      if (audience === 'agency') {
        const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
        actor = { role: 'agency', actorId: user.id, tenantId, canEdit: true }
      } else {
        const user = await requireClientAuth(event)
        if (!['admin', 'manager'].includes(user.role))
          throw createError({ statusCode: 403, statusMessage: `${contract.label} setup access denied` })
        actor = { role: 'client', actorId: user.id, clientId: user.clientId }
      }
      const siteId = getRouterParam(event, 'siteId') ?? '',
        env = event.context.cloudflare?.env ?? {}
      const login = await preparePageStudioContentLogin(event, actor)
      const admitted = await authorizePageStudioCollections({ actor, login, siteId, env }, true, true, {})
      const runtime = requirePageStudioProvisioningRuntime(env),
        binding = runtime.binding as unknown as Record<SchemaUpgradeContract['executeMethod' | 'statusMethod'], (request: unknown) => Promise<unknown>>
      if (
        runtime.environment !== admitted.scope.environment
        || typeof binding[contract.executeMethod] !== 'function'
        || typeof binding[contract.statusMethod] !== 'function'
      )
        throw pending()
      if (method === 'POST') {
        const body = Body.safeParse(await readContentBody(event))
        if (!body.success)
          throw createError({ statusCode: 400, statusMessage: `Invalid ${contract.kind} setup request` })
        const prepared = await prepare({
          actor,
          event,
          siteId,
          environment: runtime.environment,
          body: body.data
        })
        let raw: unknown
        try {
          raw = await binding[contract.executeMethod](prepared.intent)
        } catch {
          throw pending()
        }
        const result = z
          .discriminatedUnion('status', [
            z.object({ status: z.literal('running') }).strict(),
            z.object({ status: z.literal('installed'), receipt: Receipt }).strict()
          ])
          .safeParse(raw)
        if (!result.success)
          throw createError({
            statusCode: 502,
            statusMessage: `${contract.label} setup response could not be verified`
          })
        if (
          result.data.status === 'installed'
          && collectionCanonical(result.data.receipt) !== collectionCanonical(expectedReceipt(prepared.intent))
        )
          throw createError({ statusCode: 502, statusMessage: `${contract.label} setup receipt mismatch` })
        await authorize(prepared.intent, runtime.environment)
        return { status: result.data.status, requestId: body.data.requestId, canConfigure: true }
      }
      // Status never creates an intent or applies DDL. Recovery uses the retained original login.
      const saved = await queryOneFresh<{ metadata: { intent?: unknown, body?: unknown } }>(
        `SELECT metadata FROM page_studio_audit_events WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND action='content.${contract.kind}-upgrade.requested' AND resource_type='${contract.kind}_upgrade' AND metadata->'intent'->'scope'->>'environment'=$4 ORDER BY recorded_at LIMIT 1`,
        [admitted.scope.tenantId, admitted.scope.clientId, siteId, runtime.environment]
      )
      if (!saved) {
        const current = await authorizePageStudioCollections({ actor, login, siteId, env }, true, true, {})
        if (!samePageStudioContentScope(current.scope, admitted.scope)) throw createError({ statusCode: 403, statusMessage: `${contract.label} setup access denied` })
        return { status: 'pending', canConfigure: true }
      }
      const request = contract.schema.parse(saved.metadata.intent),
        body = Body.parse(saved.metadata.body)
      if (
        !samePageStudioContentScope(request.scope, admitted.scope)
        || request.actor.userId !== actor.actorId
        || request.actor.loginSessionHash !== login.tokenHash
        || request.actor.kind !== (actor.role === 'agency' ? 'agency-user' : 'client-user')
      )
        return { status: 'reconciliation', canConfigure: false }
      await authorize(request, runtime.environment)
      let raw: unknown
      try {
        raw = await binding[contract.statusMethod](request)
      } catch {
        throw pending()
      }
      const state
        = raw === null
          ? null
          : z
              .object({
                state: z.enum(['reserved', 'installed', 'disabled']),
                leaseUntil: z.string().nullable(),
                receipt: Receipt.nullable()
              })
              .strict()
              .parse(raw)
      if (
        state?.state === 'installed'
        && collectionCanonical(state.receipt) !== collectionCanonical(expectedReceipt(request))
      )
        throw createError({ statusCode: 502, statusMessage: `${contract.label} setup receipt mismatch` })
      await authorize(request, runtime.environment)
      return {
        status: state?.state ?? 'pending',
        canConfigure: state?.state !== 'disabled',
        requestId: body.requestId
      }
    } catch (error) {
      pageStudioHttpError(error)
    }
  }
}
