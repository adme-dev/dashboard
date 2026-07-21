import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  UploadPartCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getR2StorageControlPlane } from '~~/server/utils/storage'

export interface MultipartStoragePart {
  partNumber: number
  sizeBytes: number
  etag: string
}

function requireUploadId(uploadId: string | undefined): string {
  if (!uploadId) throw new Error('R2 did not return a multipart upload identifier')
  return uploadId
}

function canonicalParts(parts: MultipartStoragePart[]): Array<{ ETag: string, PartNumber: number }> {
  return [...parts]
    .sort((left, right) => left.partNumber - right.partNumber)
    .map(part => ({ ETag: part.etag, PartNumber: part.partNumber }))
}

export async function createMultipartObject(key: string, contentType: string): Promise<string> {
  const { client, bucket } = getR2StorageControlPlane()
  const response = await client.send(new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType
  }))
  return requireUploadId(response.UploadId)
}

export async function getPresignedMultipartPartUrl(input: {
  key: string
  uploadId: string
  partNumber: number
  expiresIn: number
}): Promise<string> {
  const { client, bucket } = getR2StorageControlPlane()
  return getSignedUrl(client, new UploadPartCommand({
    Bucket: bucket,
    Key: input.key,
    UploadId: input.uploadId,
    PartNumber: input.partNumber
  }), { expiresIn: input.expiresIn })
}

export async function listMultipartObjectParts(input: {
  key: string
  uploadId: string
}): Promise<MultipartStoragePart[]> {
  const { client, bucket } = getR2StorageControlPlane()
  const parts: MultipartStoragePart[] = []
  let marker: string | undefined

  do {
    const response = await client.send(new ListPartsCommand({
      Bucket: bucket,
      Key: input.key,
      UploadId: input.uploadId,
      PartNumberMarker: marker,
      MaxParts: 1000
    }))
    for (const part of response.Parts ?? []) {
      if (!part.PartNumber || part.Size === undefined || !part.ETag) {
        throw new Error('R2 returned incomplete multipart part metadata')
      }
      parts.push({
        partNumber: part.PartNumber,
        sizeBytes: part.Size,
        etag: part.ETag
      })
    }
    marker = response.IsTruncated ? response.NextPartNumberMarker : undefined
    if (response.IsTruncated && !marker) {
      throw new Error('R2 returned a truncated multipart list without a continuation marker')
    }
  } while (marker)

  return parts.sort((left, right) => left.partNumber - right.partNumber)
}

export async function completeMultipartObject(input: {
  key: string
  uploadId: string
  parts: MultipartStoragePart[]
}): Promise<void> {
  const { client, bucket } = getR2StorageControlPlane()
  await client.send(new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: input.key,
    UploadId: input.uploadId,
    MultipartUpload: { Parts: canonicalParts(input.parts) }
  }))
}

export async function abortMultipartObject(input: {
  key: string
  uploadId: string
}): Promise<void> {
  const { client, bucket } = getR2StorageControlPlane()
  await client.send(new AbortMultipartUploadCommand({
    Bucket: bucket,
    Key: input.key,
    UploadId: input.uploadId
  }))
}

export function isMultipartUploadMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { name?: string, Code?: string, code?: string }
  return candidate.name === 'NoSuchUpload'
    || candidate.Code === 'NoSuchUpload'
    || candidate.code === 'NoSuchUpload'
}
