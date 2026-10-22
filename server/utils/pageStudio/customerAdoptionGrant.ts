import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  CustomerAdoptionGrantRequestSchema,
  CustomerAdoptionOperatorSchema,
  CustomerAdoptionSourceSchema
} from '~~/shared/pageStudio/customerAdoptionGrant'
import {
  adoptionConflict,
  adoptionDenied,
  adoptionEqual,
  assertCustomerAdoptionClock,
  readCustomerAdoptionContext,
  readCustomerAdoptionPrincipals
} from './customerAdoptionContext'
import { customerAdoptionStorageReader, type CustomerAdoptionStorageDependencies } from './customerAdoptionStorage'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

const Input = z.object({ siteId: z.string().uuid(), operator: CustomerAdoptionOperatorSchema }).strict()
type Dependencies = CustomerAdoptionStorageDependencies & { runTransaction?: RunPageStudioTransaction }
interface Grant {
  grant_id: string
  revision: number
  site_id: string
  operator_id: string
  operator_login_hash: string
  source: unknown
  source_digest: string
  request: unknown
  request_digest: string
  issued_at: Date
  expires_at: Date
  enabled: boolean
}
const receipt = (grant: Grant) => ({
  grantId: grant.grant_id,
  revision: grant.revision,
  siteId: grant.site_id,
  issuedAt: grant.issued_at.toISOString(),
  expiresAt: grant.expires_at.toISOString(),
  sourceDigest: grant.source_digest
})
async function selected(db: PageStudioQueryClient, siteId: string) {
  return (
    (
      await db.query<{ grantId: string; revision: number }>(
        `SELECT grant_id AS "grantId",revision FROM page_studio_customer_adoption_selections
    WHERE site_id=$1 FOR UPDATE NOWAIT`,
        [siteId]
      )
    ).rows[0] ?? null
  )
}
/** Read-only full-source challenge. Remote reads occur outside the PG locks. */
export async function inspectCustomerAdoptionGrant(input: unknown, dependencies: Dependencies) {
  const value = Input.parse(input),
    run = dependencies.runTransaction ?? transactionWithoutRetry,
    observe = customerAdoptionStorageReader(dependencies)
  const first = await run((db) => readCustomerAdoptionContext(db, value.siteId, value.operator))
  const storage = await observe(first)
  return run(async (db) => {
    const final = await readCustomerAdoptionContext(db, value.siteId, value.operator)
    if (!adoptionEqual(first, final)) throw adoptionConflict()
    const source = CustomerAdoptionSourceSchema.parse({ ...final.source, storage }),
      selection = await selected(db, value.siteId)
    const sourceDigest = await collectionDigest(source)
    await assertCustomerAdoptionClock(db, value.siteId, value.operator)
    return { sourceDigest, selection }
  })
}
/** Independent finite adoption authority only. No old policy/plan/handoff is
 * extended and no provider write, schema preparation or CMS effect is issued. */
export async function grantCustomerAdoption(input: unknown, dependencies: Dependencies) {
  const { body, ...value } = Input.extend({ body: CustomerAdoptionGrantRequestSchema }).parse(input)
  const run = dependencies.runTransaction ?? transactionWithoutRetry,
    observe = customerAdoptionStorageReader(dependencies)
  const requestDigest = await collectionDigest(body)
  // Authenticate a historical receipt separately, without requiring a live old
  // plan, current source or current grant selection and without re-observation.
  const replay = await run(async (db) => {
    await readCustomerAdoptionPrincipals(db, value.siteId, value.operator)
    await db.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE NOWAIT', [value.siteId])
    const row = (
      await db.query<Grant>('SELECT * FROM page_studio_customer_adoption_grants WHERE grant_id=$1 FOR SHARE NOWAIT', [
        body.grantId
      ])
    ).rows[0]
    if (!row) return null
    if (
      row.site_id !== value.siteId ||
      row.operator_id !== value.operator.actorId ||
      row.operator_login_hash !== value.operator.loginSessionHash ||
      row.request_digest !== requestDigest ||
      !adoptionEqual(row.request, body) ||
      (await collectionDigest(row.source)) !== row.source_digest
    )
      throw adoptionConflict()
    await assertCustomerAdoptionClock(db, value.siteId, value.operator)
    return { historical: true as const, grant: receipt(row) }
  })
  if (replay) return replay
  const first = await run((db) => readCustomerAdoptionContext(db, value.siteId, value.operator))
  const storage = await observe(first)
  const source = CustomerAdoptionSourceSchema.parse({ ...first.source, storage }),
    sourceDigest = await collectionDigest(source)
  if (sourceDigest !== body.sourceDigest) throw adoptionConflict()
  return run(async (db) => {
    const final = await readCustomerAdoptionContext(db, value.siteId, value.operator)
    if (!adoptionEqual(first, final)) throw adoptionConflict()
    const selection = await selected(db, value.siteId)
    if ((selection?.grantId ?? null) !== body.expectedGrantId || (selection?.revision ?? 0) !== body.expectedRevision)
      throw adoptionConflict()
    const issuedAt = await assertCustomerAdoptionClock(db, value.siteId, value.operator, body.expiresAt)
    const row = (
      await db.query<Grant>(
        `INSERT INTO page_studio_customer_adoption_grants
      (grant_id,site_id,revision,operator_id,operator_login_hash,identity_id,workspace_id,source,source_digest,request,request_digest,issued_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          body.grantId,
          value.siteId,
          body.expectedRevision + 1,
          value.operator.actorId,
          value.operator.loginSessionHash,
          source.owner.identityId,
          source.owner.workspaceId,
          source,
          sourceDigest,
          body,
          requestDigest,
          issuedAt,
          body.expiresAt
        ]
      )
    ).rows[0]!
    const changed = selection
      ? await db.query(
          `UPDATE page_studio_customer_adoption_selections SET grant_id=$2,revision=$3
      WHERE site_id=$1 AND grant_id=$4 AND revision=$5 RETURNING site_id`,
          [value.siteId, body.grantId, row.revision, body.expectedGrantId, body.expectedRevision]
        )
      : await db.query(
          `INSERT INTO page_studio_customer_adoption_selections(site_id,grant_id,revision) VALUES($1,$2,$3) RETURNING site_id`,
          [value.siteId, body.grantId, row.revision]
        )
    if (changed.rows.length !== 1) throw adoptionConflict()
    if (!adoptionEqual(final, await readCustomerAdoptionContext(db, value.siteId, value.operator)))
      throw adoptionConflict()
    if (!adoptionEqual(await selected(db, value.siteId), { grantId: row.grant_id, revision: row.revision }))
      throw adoptionConflict()
    await assertCustomerAdoptionClock(db, value.siteId, value.operator, body.expiresAt)
    return { historical: false as const, grant: receipt(row) }
  })
}
export async function withdrawCustomerAdoptionGrant(
  input: unknown,
  dependencies: { runTransaction?: RunPageStudioTransaction } = {}
) {
  const value = Input.extend({ grantId: z.string().uuid(), expectedRevision: z.number().int().positive() }).parse(input)
  return (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
    await readCustomerAdoptionPrincipals(db, value.siteId, value.operator)
    await db.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE NOWAIT', [value.siteId])
    if (!adoptionEqual(await selected(db, value.siteId), { grantId: value.grantId, revision: value.expectedRevision }))
      throw adoptionConflict()
    const row = (
      await db.query<Grant>('SELECT * FROM page_studio_customer_adoption_grants WHERE grant_id=$1 FOR UPDATE NOWAIT', [
        value.grantId
      ])
    ).rows[0]
    if (!row || row.operator_id !== value.operator.actorId || row.site_id !== value.siteId) throw adoptionDenied()
    if (row.enabled)
      await db.query(
        'UPDATE page_studio_customer_adoption_grants SET enabled=FALSE,withdrawn_at=clock_timestamp() WHERE grant_id=$1 AND enabled',
        [value.grantId]
      )
    await readCustomerAdoptionPrincipals(db, value.siteId, value.operator)
    await assertCustomerAdoptionClock(db, value.siteId, value.operator)
    return { withdrawn: true as const, grant: receipt(row) }
  })
}
