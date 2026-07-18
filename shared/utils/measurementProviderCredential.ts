const MEASUREMENT_PROVIDER_BINDING = /^MEASUREMENT_PROVIDER_[A-Z0-9_]{1,96}$/

export function isMeasurementProviderCredentialRef(value: string): boolean {
  return MEASUREMENT_PROVIDER_BINDING.test(value)
}
