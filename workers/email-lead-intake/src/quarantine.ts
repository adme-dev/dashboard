export {
  createOpaqueEmailObjectKey,
  decryptStagedEmail,
  decryptRawEmail,
  encryptStagedEmail,
  encryptRawEmail,
  secretsAreEqual
} from '../../../shared/leads/email/quarantine'
import type { EmailStagedManifest } from '../../../shared/leads/email/contracts'

export function encryptedRawEmailPutOptions(
  expiresAt: string,
  correlationId: string,
  manifest: EmailStagedManifest
): R2PutOptions {
  return {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: {
      schemaVersion: '2',
      expiresAt,
      correlationId,
      rawContentHashVersion: String(manifest.rawContentHashVersion),
      rawContentHash: manifest.rawContentHash
    }
  }
}

export async function putEncryptedRawEmail(
  bucket: R2Bucket,
  objectKey: string,
  encrypted: Uint8Array,
  options: R2PutOptions
): Promise<void> {
  await bucket.put(objectKey, encrypted, options)
}

export async function deleteEncryptedRawEmail(bucket: R2Bucket, objectKey: string): Promise<void> {
  await bucket.delete(objectKey)
}
