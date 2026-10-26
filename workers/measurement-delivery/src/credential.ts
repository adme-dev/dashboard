import { resolveGoogleRefreshCredential, type GoogleRefreshCredentialRow } from '../../../shared/utils/googleRefreshCredential'

import { isMeasurementProviderCredentialRef } from '../../../shared/utils/measurementProviderCredential'

interface SecretsStoreBinding {
  get(): Promise<string>
}

function isSecretsStoreBinding(value: unknown): value is SecretsStoreBinding {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { get?: unknown }).get === 'function'
}

function normalizedSecret(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/**
 * Resolve only purpose-scoped measurement bindings. The database stores the
 * binding name, never the provider token. Pages encrypted secrets are strings;
 * Workers Secrets Store bindings expose an asynchronous get().
 */
export async function resolveMeasurementProviderCredential(
  env: Record<string, unknown>,
  credentialRef: string | null
): Promise<string | null> {
  if (!credentialRef || !isMeasurementProviderCredentialRef(credentialRef)) return null
  const binding = env[credentialRef]
  if (typeof binding === 'string') return normalizedSecret(binding)
  if (!isSecretsStoreBinding(binding)) return null
  return normalizedSecret(await binding.get())
}

/** Uses the same AES-256-GCM bytea format as Pages tokenCrypto, with an explicit
 * per-worker binding rather than process.env or a cross-environment key cache. */
export function createGoogleRefreshTokenResolver(encryptionKey?: string) {
  return (row: GoogleRefreshCredentialRow): Promise<string | null> => resolveGoogleRefreshCredential(row, {
    decrypt: async (ciphertext, iv) => {
      if (!encryptionKey) throw new Error('Google credential encryption key is unavailable')
      const keyBytes = Uint8Array.from(atob(encryptionKey), character => character.charCodeAt(0))
      if (keyBytes.length !== 32) throw new Error('Google credential encryption key is invalid')
      const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) as BufferSource },
        key,
        new Uint8Array(ciphertext) as BufferSource
      )
      return new TextDecoder().decode(plaintext)
    }
  })
}
