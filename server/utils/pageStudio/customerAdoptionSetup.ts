import { z } from 'zod'
import type { H3Event } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import {
  CustomerAdoptionGrantReferenceSchema,
  CustomerAdoptionSetupRequestSchema,
  CustomerAdoptionSourceSchema
} from '~~/shared/pageStudio/customerAdoptionGrant'
import { CustomerCmsAdoptionStatusSchema } from '~~/shared/pageStudio/customerCmsSetup'
import { CustomerEditorClaimsSchema, type CustomerEditorClaims } from './customerEditorToken'
import { readCustomerActivation } from './customerActivation'
import { issueCustomerCmsAdoptionHandoff, parseCustomerEditorHandoffConfiguration } from './customerEditorHandoff'
import { exchangeCustomerEditorSession } from './customerEditorSessions'
import { assertCustomerEditorSessionAuthority } from './customerEditorSessionAuthority'
import { readCustomerAdoptionAuthority } from './customerAdoptionAuthority'
import { readCustomerAdoptionContext, adoptionDenied, adoptionEqual } from './customerAdoptionContext'
import { customerAdoptionStorageReader, type CustomerAdoptionStorageDependencies } from './customerAdoptionStorage'
import { coordinateCmsAdoption } from './cmsAdoptionCoordinator'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

interface Options extends CustomerAdoptionStorageDependencies {
  configuration: unknown
  env: Record<string, unknown>
  event?: H3Event
  runTransaction?: RunPageStudioTransaction
  signToken?: (claims: CustomerEditorClaims) => Promise<string>
}
type Reference = z.infer<typeof CustomerAdoptionGrantReferenceSchema>
const Token = z.string().regex(/^[A-Za-z0-9_-]{64}$/)
function configuration(options: Options) {
  const config = parseCustomerEditorHandoffConfiguration(options.configuration)
  if (
    config.environment !== 'staging' ||
    options.env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true' ||
    options.env.PAGE_STUDIO_CONTENT_ENVIRONMENT !== 'staging' ||
    !readCustomerActivation(options.env).cmsSetupEnabled
  )
    throw adoptionDenied()
  return config
}
async function context(db: PageStudioQueryClient, tokenHash: string, reference: Reference) {
  const grant = (
    await db.query<{ site_id: string; operator_id: string; operator_login_hash: string; source: unknown }>(
      `
    SELECT site_id,operator_id,operator_login_hash,source FROM page_studio_customer_adoption_grants
    WHERE grant_id=$1 AND revision=$2`,
      [reference.grantId, reference.revision]
    )
  ).rows[0]
  if (!grant) throw adoptionDenied()
  const receipt = {
    site_id: grant.site_id,
    login_session_hash: tokenHash,
    adoption_grant_id: reference.grantId,
    adoption_grant_revision: reference.revision
  }
  const authority = await readCustomerAdoptionAuthority(db, receipt)
  const source = CustomerAdoptionSourceSchema.parse(grant.source)
  const observed = await readCustomerAdoptionContext(
    db,
    grant.site_id,
    { actorId: grant.operator_id, loginSessionHash: grant.operator_login_hash },
    false
  )
  await readCustomerAdoptionAuthority(db, receipt)
  return { authority, receipt, source, observed }
}
async function claimsFor(token: unknown, reference: Reference, options: Options, issue: boolean) {
  Token.parse(token)
  const config = configuration(options),
    observe = customerAdoptionStorageReader(options),
    run = options.runTransaction ?? transactionWithoutRetry
  const tokenHash = await digestPortalSessionToken(token as string)
  const before = await run((db) => context(db, tokenHash, reference))
  if (!adoptionEqual(await observe(before.observed), before.source.storage)) throw adoptionDenied()
  return run(async (db) => {
    const current = await context(db, tokenHash, reference)
    configuration(options)
    if (
      !adoptionEqual(current.source, before.source) ||
      !adoptionEqual(current.observed.source, before.observed.source)
    )
      throw adoptionDenied()
    const rows = (
      await db.query<{ claims: unknown }>(
        `SELECT child.claims FROM page_studio_customer_editor_sessions child
      JOIN page_studio_customer_editor_handoffs handoff ON handoff.id=child.handoff_id
      WHERE handoff.purpose='cms-adoption' AND handoff.adoption_grant_id=$1 AND handoff.adoption_grant_revision=$2
        AND handoff.login_session_hash=$3 AND handoff.site_id=$4 AND handoff.dashboard_origin=$5 AND handoff.editor_origin=$6
        AND child.revoked_at IS NULL AND child.expires_at>clock_timestamp()`,
        [
          reference.grantId,
          reference.revision,
          tokenHash,
          current.receipt.site_id,
          config.dashboardOrigin,
          config.editorOrigin
        ]
      )
    ).rows
    if (rows.length > 1) throw adoptionDenied()
    let claims: CustomerEditorClaims | null = rows[0] ? CustomerEditorClaimsSchema.parse(rows[0].claims) : null
    if (!claims && issue) {
      const deps = { runTransaction: ((work) => work(db)) as RunPageStudioTransaction }
      const ticket = await issueCustomerCmsAdoptionHandoff(token, config, reference, deps)
      const child = await exchangeCustomerEditorSession(ticket.token, config, {
        ...deps,
        event: options.event,
        signToken: options.signToken
      })
      claims = CustomerEditorClaimsSchema.parse(
        (
          await db.query<{ claims: unknown }>(
            'SELECT claims FROM page_studio_customer_editor_sessions WHERE nonce=$1',
            [child.sessionId]
          )
        ).rows[0]?.claims
      )
    }
    if (claims) await assertCustomerEditorSessionAuthority(claims, 'cms:adopt', db)
    else await readCustomerAdoptionAuthority(db, current.receipt)
    return claims
  })
}
/** Private owner adapter. No schema operation, preview/editor admission,
 * provisioning call, published action or child credential is returned. */
export async function readCustomerAdoptionSetup(token: unknown, reference: unknown, options: Options) {
  const claims = await claimsFor(token, CustomerAdoptionGrantReferenceSchema.parse(reference), options, false)
  if (!claims) return { resumeRequired: true, adoption: null }
  const value = await coordinateCmsAdoption(
    { action: 'status' },
    { source: 'customer-session', claims, env: options.env, capability: 'cms:adopt' },
    options
  )
  await (options.runTransaction ?? transactionWithoutRetry)((db) =>
    assertCustomerEditorSessionAuthority(claims, 'cms:adopt', db)
  )
  return {
    resumeRequired: false,
    adoption: CustomerCmsAdoptionStatusSchema.parse({
      phase: value.phase,
      adoptionId: value.adoptionId,
      progress: value.progress,
      recoveryId: value.recoveryId,
      recoveryRequired: value.recoveryRequired,
      progressDigest: value.progressDigest
    })
  }
}
export async function mutateCustomerAdoptionSetup(token: unknown, input: unknown, options: Options) {
  const request = CustomerAdoptionSetupRequestSchema.parse(input)
  const claims = await claimsFor(token, request.grant, options, request.operation === 'resume')
  if (!claims) throw adoptionDenied()
  if (request.operation === 'resume') return { resumed: true }
  const value = await coordinateCmsAdoption(
    request.request,
    { source: 'customer-session', claims, env: options.env, capability: 'cms:adopt' },
    options
  )
  await (options.runTransaction ?? transactionWithoutRetry)((db) =>
    assertCustomerEditorSessionAuthority(claims, 'cms:adopt', db)
  )
  return CustomerCmsAdoptionStatusSchema.parse({
    phase: value.phase,
    adoptionId: value.adoptionId,
    progress: value.progress,
    recoveryId: value.recoveryId,
    recoveryRequired: value.recoveryRequired,
    progressDigest: value.progressDigest
  })
}
