import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { readContinuationJournal } from '~~/server/utils/pageStudio/continuationJournal'

const fixture = JSON.parse(readFileSync('test/fixtures/transfer-recovery-continuation-journal-planned.json', 'utf8'))
// Query-result corruption tests, not real DB or current-authority acceptance.
const rows = () => fixture.journal.map((e: Record<string, unknown>) => ({ operation_id: e.operationId, sequence: e.sequence, entry_id: e.entryId,
  kind: e.kind, previous_digest: e.previousDigest, body: e.body as Record<string, unknown>, body_json: collectionCanonical(e.body), digest: e.digest }))
const client = (values: unknown[]) => ({ query: async <T>() => ({ rows: values as T[] }) })
describe('retained continuation journal read boundary', () => {
  it('reconstructs the exact retained causal chain and cursor', async () => {
    const value = await readContinuationJournal(client(rows()), fixture.grant.operationId)
    expect(value.entries).toEqual(fixture.journal)
    expect(value.cursor).toEqual({ sequence: fixture.journal.at(-1).sequence, digest: fixture.journal.at(-1).digest })
    expect(await readContinuationJournal(client([]), fixture.grant.operationId)).toEqual({ entries: [], cursor: null })
  })
  it('rejects noncanonical, foreign, reordered and tampered retained rows', async () => {
    const cases = [
      (r: ReturnType<typeof rows>) => { r[0].body_json = JSON.stringify(r[0].body, null, 2) },
      (r: ReturnType<typeof rows>) => { r[0].operation_id = '00000000-0000-4000-8000-000000000001' },
      (r: ReturnType<typeof rows>) => {
        r[1].body.receiptDigest = 'f'.repeat(64)
        r[1].body_json = collectionCanonical(r[1].body)
      },
      (r: ReturnType<typeof rows>) => { r.reverse() },
      (r: ReturnType<typeof rows>) => {
        r[0].body.extra = true
        r[0].body_json = collectionCanonical(r[0].body)
      }
    ]
    for (const change of cases) {
      const value = structuredClone(rows())
      change(value)
      await expect(readContinuationJournal(client(value), fixture.grant.operationId)).rejects.toThrow()
    }
  })
})
