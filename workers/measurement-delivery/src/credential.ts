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
