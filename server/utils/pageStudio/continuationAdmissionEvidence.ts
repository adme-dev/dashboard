// Durable byte/ownership evidence only. Before dispatch or treating an observed
// head as a receipt, the controller MUST run the native transition verifier and
// current-authority checks. These helpers intentionally perform no provider call.
import { z } from 'zod'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ContinuationCursorSchema, ContinuationGrantSchema } from '~~/shared/pageStudio/transferRecoveryContinuation'

const Id = z.uuid(), Digest = z.string().regex(/^[a-f0-9]{64}$/)
const JsonObject = z.record(z.string(), z.json())
const Action = z.enum(['prepare', 'enable', 'revoke'])
const Header = z.object({ operationId: Id, continuationId: Id, eventId: Id, action: Action,
  cursor: ContinuationCursorSchema, grantDigest: Digest, requestDigest: Digest, previousDigest: Digest }).strict()
const Evidence = z.discriminatedUnion('kind', [
  Header.extend({ kind: z.literal('planned'), payload: z.object({ request: JsonObject, previous: JsonObject }).strict(), digest: Digest }).strict(),
  Header.extend({ kind: z.literal('observed'), payload: z.object({ result: JsonObject }).strict(), digest: Digest }).strict()
])
type Evidence = z.infer<typeof Evidence>
type Stored = {
  operation_id: string
  continuation_id: string
  event_id: string
  action: string
  kind: string
  journal_sequence: number
  journal_digest: string
  grant_digest: string
  request_digest: string
  previous_digest: string
  payload: unknown
  payload_json: string
  digest: string
}
function deny(): never {
  throw new Error('Continuation admission evidence changed')
}
const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
function bounded(input: unknown) {
  const object = JsonObject.parse(input)
  if (new TextEncoder().encode(collectionCanonical(object)).byteLength > 65536) throw new Error('Native admission evidence exceeds size limit')
  return object
}
async function validate(entry: Evidence) {
  const { digest, ...body } = entry
  if (await collectionDigest(body) !== digest) deny()
  if (entry.kind === 'planned') {
    const request = bounded(entry.payload.request), previous = bounded(entry.payload.previous)
    const grant = ContinuationGrantSchema.parse(request.grant)
    if (request.purpose !== 'recovery-continuation-admission' || request.formatVersion !== 1
      || request.action !== entry.action || request.eventId !== entry.eventId
      || grant.operationId !== entry.operationId || grant.continuationId !== entry.continuationId
      || grant.intentDigest !== previous.intentDigest || previous.operationId !== entry.operationId
      || typeof request.expectedVersion !== 'number' || !Number.isInteger(request.expectedVersion)
      || request.expectedVersion < 1 || request.expectedVersion > 2147483646 || request.expectedVersion !== previous.version
      || request.previousHeadDigest !== entry.previousDigest || await collectionDigest(previous) !== entry.previousDigest
      || await collectionDigest(request) !== entry.requestDigest || await collectionDigest(grant) !== entry.grantDigest) deny()
  } else {
    const result = bounded(entry.payload.result)
    if (result.operationId !== entry.operationId || result.grantDigest !== entry.grantDigest
      || result.mode !== { prepare: 'prepared', enable: 'enabled', revoke: 'revoked' }[entry.action]) deny()
  }
  return entry
}
async function lockSite(db: PageStudioQueryClient, operationId: string) {
  const result = await db.query(`SELECT s.id FROM page_studio_sites s JOIN page_studio_managed_transfer_intents i ON i.site_id=s.id
    WHERE i.operation_id=$1 FOR NO KEY UPDATE OF s NOWAIT`, [operationId])
  if (result.rows.length !== 1) deny()
}
/** Returns retained JSON, NOT a validated native transition or permission. */
export async function readContinuationAdmissionEvidence(db: PageStudioQueryClient, operationInput: unknown, eventInput: unknown) {
  const operationId = Id.parse(operationInput), eventId = Id.parse(eventInput)
  const { rows } = await db.query<Stored>(`SELECT operation_id,continuation_id,event_id,action,kind,journal_sequence,journal_digest,
    grant_digest,request_digest,previous_digest,payload,payload_json,digest
    FROM page_studio_continuation_admission_evidence WHERE operation_id=$1 AND event_id=$2 ORDER BY kind DESC`, [operationId, eventId])
  if (!rows.length) return null
  const entries: Evidence[] = []
  for (const row of rows) {
    if (row.operation_id !== operationId || row.event_id !== eventId || row.payload_json !== collectionCanonical(row.payload)) deny()
    entries.push(await validate(Evidence.parse({ operationId, eventId, continuationId: row.continuation_id, action: row.action,
      kind: row.kind, cursor: { sequence: row.journal_sequence, digest: row.journal_digest }, grantDigest: row.grant_digest,
      requestDigest: row.request_digest, previousDigest: row.previous_digest, payload: row.payload, digest: row.digest })))
  }
  const planned = entries.find(e => e.kind === 'planned'), observed = entries.find(e => e.kind === 'observed') ?? null
  if (!planned || entries.length !== (observed ? 2 : 1)) deny()
  if (observed) {
    if (!same(Header.parse(plannedHeader(planned)), Header.parse(plannedHeader(observed)))
      || observed.payload.result.intentDigest !== planned.payload.previous.intentDigest
      || observed.payload.result.version !== Number(planned.payload.request.expectedVersion) + 1) deny()
  }
  return { planned, observed }
}
function plannedHeader(entry: Evidence) {
  const { payload: _payload, kind: _kind, digest: _digest, ...header } = entry
  return header
}
async function insert(db: PageStudioQueryClient, entry: Evidence) {
  await db.query(`INSERT INTO page_studio_continuation_admission_evidence
    (operation_id,continuation_id,event_id,action,kind,journal_sequence,journal_digest,grant_digest,request_digest,previous_digest,payload,payload_json,digest)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
  [entry.operationId, entry.continuationId, entry.eventId, entry.action, entry.kind, entry.cursor.sequence, entry.cursor.digest,
    entry.grantDigest, entry.requestDigest, entry.previousDigest, JSON.stringify(entry.payload), collectionCanonical(entry.payload), entry.digest])
  const retained = await readContinuationAdmissionEvidence(db, entry.operationId, entry.eventId)
  if (!retained || !same(retained[entry.kind], entry)) deny()
  return entry
}
/** Caller must commit with its final authority fence BEFORE native dispatch.
 * An exact retry only retrieves bytes; it never authorizes dispatch again. */
export async function planContinuationAdmissionEvidence(db: PageStudioQueryClient, input: { cursor: unknown, request: unknown, previous: unknown }) {
  const cursor = ContinuationCursorSchema.parse(input.cursor)
  const request = bounded(input.request), previous = bounded(input.previous)
  const grant = ContinuationGrantSchema.parse(request.grant)
  const header = Header.parse({ operationId: grant.operationId, continuationId: grant.continuationId,
    eventId: request.eventId, action: request.action, cursor, grantDigest: await collectionDigest(grant),
    requestDigest: await collectionDigest(request), previousDigest: await collectionDigest(previous) })
  const body = { ...header, kind: 'planned' as const, payload: { request, previous } }
  const entry = await validate(Evidence.parse({ ...body, digest: await collectionDigest(body) }))
  await lockSite(db, header.operationId)
  const retained = await readContinuationAdmissionEvidence(db, header.operationId, header.eventId)
  if (retained) {
    if (!same(retained.planned, entry)) deny()
    return retained.planned
  }
  return insert(db, entry)
}
/** Persist only after native verification against the retained request/previous.
 * Historical evidence may be recorded after expiry; journal advancement cannot. */
export async function observeContinuationAdmissionEvidence(db: PageStudioQueryClient, input: { operationId: unknown, eventId: unknown, result: unknown }) {
  const operationId = Id.parse(input.operationId), eventId = Id.parse(input.eventId), result = bounded(input.result)
  await lockSite(db, operationId)
  const retained = await readContinuationAdmissionEvidence(db, operationId, eventId)
  if (!retained) deny()
  if (result.intentDigest !== retained.planned.payload.previous.intentDigest
    || result.version !== Number(retained.planned.payload.request.expectedVersion) + 1) deny()
  const body = { ...plannedHeader(retained.planned), kind: 'observed' as const, payload: { result } }
  const entry = await validate(Evidence.parse({ ...body, digest: await collectionDigest(body) }))
  if (retained.observed) {
    if (!same(retained.observed, entry)) deny()
    return retained.observed
  }
  return insert(db, entry)
}
