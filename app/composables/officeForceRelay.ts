// Tiny helper isolating the runtime-config read for unit testability.
// Used by useOfficeRealtime to drive `overrides.forceRelay` on SDK.init.
// Strict boolean-true comparison — string "true" returns false. Pages env
// vars are string-typed; Nuxt's runtime config layer is expected to coerce
// NUXT_PUBLIC_OFFICE_FORCE_RELAY=true to a real boolean before reaching here.

export interface ForceRelayConfig {
  public: {
    officeForceRelay?: unknown
  }
}

export function resolveForceRelay(config: ForceRelayConfig): boolean {
  return config.public.officeForceRelay === true
}
