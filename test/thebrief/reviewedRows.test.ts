import { expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { createHash } from 'node:crypto'
import { readArchiveEntries } from '../../scripts/thebrief/inspect-archive.mjs'
import { archiveContentSha256, reviewedRowsForArchive } from '../../scripts/thebrief/reviewed-row-layouts.mjs'

it('binds reviewed contents independently of ZIP timestamps, order and compression', () => {
  const files = { 'index.html': strToU8('<p>Reviewed</p>'), 'fonts/source.woff': strToU8('source face') }
  const first = zipSync(files, { level: 0, mtime: new Date('2026-01-01T00:00:00Z') })
  const later = zipSync(Object.fromEntries(Object.entries(files).reverse()), { level: 6, mtime: new Date('2026-11-25T00:00:00Z') })
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  expect(hash(first)).not.toBe(hash(later))
  const receipt = archiveContentSha256(readArchiveEntries(first))
  expect(archiveContentSha256(readArchiveEntries(later))).toBe(receipt)
  for (const path of Object.keys(files)) {
    const changed = zipSync({ ...files, [path]: strToU8('changed bytes') })
    expect(archiveContentSha256(readArchiveEntries(changed))).not.toBe(receipt)
  }
  expect(archiveContentSha256(readArchiveEntries(zipSync({ ...files, 'extra.txt': strToU8('new') })))).not.toBe(receipt)
})

it('keeps the actual archive identity and requires an explicitly reviewed content digest', () => {
  const actual = 'a'.repeat(64)
  const content = 'a2a3f2662ae524a08f14191b3491373846c257c9d8d8e85dca225a4fe7989b60'
  expect(reviewedRowsForArchive(actual, content)).toEqual({ sha256: actual, designHash: 'zmr2y6k', rowLines: { 'element-134': [1, 2] } })
  expect(reviewedRowsForArchive(actual, 'b'.repeat(64))).toBeUndefined()
})
