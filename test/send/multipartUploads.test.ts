import { describe, expect, it } from 'vitest'
import {
  MULTIPART_MAX_PARTS,
  MULTIPART_MIN_PART_SIZE_BYTES,
  expectedMultipartPartSize,
  resolveMultipartGeometry
} from '../../server/utils/send/multipart'

const MiB = 1024 * 1024

describe('Send multipart geometry', () => {
  it('uses equal non-final parts and an exact final remainder', () => {
    const geometry = resolveMultipartGeometry(41 * MiB + 17, 16 * MiB)

    expect(geometry).toEqual({
      fileSizeBytes: 41 * MiB + 17,
      partSizeBytes: 16 * MiB,
      partCount: 3,
      finalPartSizeBytes: 9 * MiB + 17
    })
    expect(expectedMultipartPartSize(geometry, 1)).toBe(16 * MiB)
    expect(expectedMultipartPartSize(geometry, 2)).toBe(16 * MiB)
    expect(expectedMultipartPartSize(geometry, 3)).toBe(9 * MiB + 17)
  })

  it('keeps an exact multiple as a full-sized final part', () => {
    const geometry = resolveMultipartGeometry(32 * MiB, 16 * MiB)
    expect(geometry.partCount).toBe(2)
    expect(geometry.finalPartSizeBytes).toBe(16 * MiB)
  })

  it.each([
    ['zero-sized file', 0, 16 * MiB],
    ['part below R2 minimum', 16 * MiB, MULTIPART_MIN_PART_SIZE_BYTES - 1],
    ['unsafe file size', Number.MAX_SAFE_INTEGER + 1, 16 * MiB]
  ])('rejects invalid geometry: %s', (_label, fileSize, partSize) => {
    expect(() => resolveMultipartGeometry(fileSize, partSize)).toThrow()
  })

  it('rejects files that would exceed the R2 part-count ceiling', () => {
    const partSize = MULTIPART_MIN_PART_SIZE_BYTES
    expect(() => resolveMultipartGeometry((MULTIPART_MAX_PARTS + 1) * partSize, partSize))
      .toThrow(/10,000 parts/)
  })

  it.each([0, 4])('rejects an out-of-range requested part number: %s', (partNumber) => {
    const geometry = resolveMultipartGeometry(41 * MiB, 16 * MiB)
    expect(() => expectedMultipartPartSize(geometry, partNumber)).toThrow(/part number/i)
  })
})
