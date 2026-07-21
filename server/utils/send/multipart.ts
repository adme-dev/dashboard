export const MULTIPART_MIN_PART_SIZE_BYTES = 5 * 1024 * 1024
export const MULTIPART_MAX_PART_SIZE_BYTES = 5 * 1024 * 1024 * 1024
export const MULTIPART_MAX_PARTS = 10_000

export interface MultipartGeometry {
  fileSizeBytes: number
  partSizeBytes: number
  partCount: number
  finalPartSizeBytes: number
}

function positiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
}

export function resolveMultipartGeometry(
  fileSizeBytes: number,
  partSizeBytes: number
): MultipartGeometry {
  positiveSafeInteger(fileSizeBytes, 'Multipart file size')
  positiveSafeInteger(partSizeBytes, 'Multipart part size')
  if (partSizeBytes < MULTIPART_MIN_PART_SIZE_BYTES) {
    throw new Error('Multipart part size must be at least 5 MiB')
  }
  if (partSizeBytes > MULTIPART_MAX_PART_SIZE_BYTES) {
    throw new Error('Multipart part size must not exceed 5 GiB')
  }

  const partCount = Math.ceil(fileSizeBytes / partSizeBytes)
  if (partCount > MULTIPART_MAX_PARTS) {
    throw new Error('Multipart upload must not exceed 10,000 parts')
  }
  const finalPartSizeBytes = fileSizeBytes - ((partCount - 1) * partSizeBytes)

  return { fileSizeBytes, partSizeBytes, partCount, finalPartSizeBytes }
}

export function expectedMultipartPartSize(
  geometry: MultipartGeometry,
  partNumber: number
): number {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > geometry.partCount) {
    throw new Error('Multipart part number is outside the upload geometry')
  }
  return partNumber === geometry.partCount
    ? geometry.finalPartSizeBytes
    : geometry.partSizeBytes
}
