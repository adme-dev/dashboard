// Private persistence only. No caller, authority or physical-proof permission is
// inferred from journal bytes. Controllers must verify both before appending.
import { z } from 'zod'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { CONTINUATION_MAX_ENTRIES, ContinuationCursorSchema, ContinuationJournalEntrySchema, verifyContinuationJournal } from '~~/shared/pageStudio/transferRecoveryContinuation'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'

const Id = z.uuid()
const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
type Stored = {
  operation_id: string
  sequence: number
  entry_id: string
  kind: string
  previous_digest: string | null
  body: unknown
  body_json: string
  digest: string
}
export async function readContinuationJournal(db: PageStudioQueryClient, operationInput: unknown) {
  const operationId = Id.parse(operationInput)
  const { rows } = await db.query<Stored>(`SELECT operation_id,sequence,entry_id,kind,previous_digest,body,body_json,digest
    FROM page_studio_transfer_recovery_continuations WHERE operation_id=$1 ORDER BY sequence LIMIT $2`,
  [operationId, CONTINUATION_MAX_ENTRIES + 1])
  const entries = rows.map((row) => {
    if (row.operation_id !== operationId || row.body_json !== collectionCanonical(row.body)) throw new Error('Retained continuation bytes changed')
    return ContinuationJournalEntrySchema.parse({ operationId: row.operation_id, sequence: row.sequence, entryId: row.entry_id,
      kind: row.kind, previousDigest: row.previous_digest, body: row.body, digest: row.digest })
  })
  const cursor = entries.length ? await verifyContinuationJournal(entries) : null
  return { entries, cursor }
}

/** Caller owns the transaction through its current-authority final clock fence.
 * Original site lock serializes normal transfer and continuation writers; SQL
 * independently verifies CAS, consent, clock, lineage and append-only history. */
export async function appendContinuationJournal(db: PageStudioQueryClient, expectedInput: unknown, entryInput: unknown) {
  const expected = ContinuationCursorSchema.nullable().parse(expectedInput)
  const entry = ContinuationJournalEntrySchema.parse(structuredClone(entryInput))
  const site = (await db.query(`SELECT s.id FROM page_studio_sites s JOIN page_studio_managed_transfer_intents i ON i.site_id=s.id
    WHERE i.operation_id=$1 FOR NO KEY UPDATE OF s NOWAIT`, [entry.operationId])).rows
  if (site.length !== 1) throw new Error('Original continuation site unavailable')
  const retained = await readContinuationJournal(db, entry.operationId)
  if (!same(retained.cursor, expected) || entry.sequence !== (expected?.sequence ?? 0) + 1
    || entry.previousDigest !== (expected?.digest ?? null)) throw new Error('Continuation cursor changed')
  await verifyContinuationJournal([...retained.entries, entry])
  await db.query(`INSERT INTO page_studio_transfer_recovery_continuations
    (operation_id,sequence,entry_id,kind,previous_digest,body,body_json,digest) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
  [entry.operationId, entry.sequence, entry.entryId, entry.kind, entry.previousDigest,
    JSON.stringify(entry.body), collectionCanonical(entry.body), entry.digest])
  const readback = await readContinuationJournal(db, entry.operationId)
  if (!same(readback.entries.at(-1), entry)) throw new Error('Continuation write readback changed')
  return entry
}
