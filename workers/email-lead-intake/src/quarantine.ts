export {
  createOpaqueEmailObjectKey,
  decryptStagedEmail,
  decryptRawEmail,
  encryptStagedEmail,
  encryptRawEmail,
  secretsAreEqual
} from '../../../shared/leads/email/quarantine'

export function encryptedRawEmailPutOptions(
  expiresAt: string,
  correlationId: string
): R2PutOptions {
  return {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { schemaVersion: '1', expiresAt, correlationId }
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
