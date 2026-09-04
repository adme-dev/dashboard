import { GoogleOAuthRefreshError } from './providers'
import type {
  deliverGoogleDataManagerEvent,
  deliverMetaConversionEvent,
  deliverTikTokEvent,
  MeasurementProviderDelivery,
  ProviderDeliveryResult,
  refreshGoogleDataManagerAccessToken
} from './providers'

const GOOGLE_DATA_MANAGER_SCOPE = 'https://www.googleapis.com/auth/datamanager'

export interface MeasurementDeliveryMessage {
  schemaVersion: 1
  clientId: string
  eventId: string
  enqueuedAt: string
}

export interface MeasurementDeliveryClaim extends MeasurementProviderDelivery {
  clientId: string
  deliveryId: string
  destinationId: string
  attemptNumber: number
  platform: 'meta' | 'google_data_manager' | 'tiktok'
  profileEnabled: boolean
  profileEnvironment: 'test' | 'live' | 'paused'
  profileCacheCurrent: boolean
  destinationEnabled: boolean
  destinationEnvironment: 'test' | 'live' | 'paused'
  destinationHealthStatus: 'not_configured' | 'detected' | 'configured' | 'validating' | 'ready' | 'degraded' | 'blocked'
  deliveryConfigCurrent: boolean
  credentialRef: string | null
  refreshToken: string | null
  connectionScopes: string[]
}

export type RecordedDeliveryResult = Omit<ProviderDeliveryResult, 'outcome'> & {
  outcome: ProviderDeliveryResult['outcome'] | 'policy_skipped'
}

interface DeliveryRepository {
  claimNext(
    message: MeasurementDeliveryMessage,
    workerId: string,
    now: Date
  ): Promise<MeasurementDeliveryClaim | null>
  complete(
    claim: MeasurementDeliveryClaim,
    result: RecordedDeliveryResult,
    now: Date
  ): Promise<void>
}

interface DeliveryProcessorDeps {
  repository: DeliveryRepository
  deliverMeta: typeof deliverMetaConversionEvent
  deliverGoogle: typeof deliverGoogleDataManagerEvent
  deliverTikTok: typeof deliverTikTokEvent
  refreshGoogleAccessToken: typeof refreshGoogleDataManagerAccessToken
  resolveProviderCredential(credentialRef: string): Promise<string | null>
  workerId: () => string
  now: () => Date
  metaGraphApiVersion: string
  googleClientId: string
  googleClientSecret: string
  fetch: typeof fetch
}

export interface MeasurementDeliveryProcessResult {
  claimed: number
  accepted: number
  retryable: number
  permanentFailure: number
  policySkipped: number
}

function policyFailure(claim: MeasurementDeliveryClaim): RecordedDeliveryResult | null {
  if (!claim.profileEnabled || claim.profileEnvironment !== 'live') {
    return {
      outcome: 'policy_skipped',
      providerRequestId: null,
      errorClass: 'profile_not_live',
      redactedDiagnostic: 'Measurement profile is not live'
    }
  }
  if (!claim.profileCacheCurrent || !claim.deliveryConfigCurrent) {
    return {
      outcome: 'policy_skipped',
      providerRequestId: null,
      errorClass: 'configuration_not_current',
      redactedDiagnostic: 'Delivery configuration is no longer current'
    }
  }
  if (
    !claim.destinationEnabled
    || claim.destinationEnvironment !== 'live'
    || !(
      ['ready', 'degraded'].includes(claim.destinationHealthStatus)
      || (claim.platform === 'google_data_manager' && claim.destinationHealthStatus === 'validating')
    )
  ) {
    return {
      outcome: 'policy_skipped',
      providerRequestId: null,
      errorClass: 'destination_not_live',
      redactedDiagnostic: 'Conversion destination is not live and ready'
    }
  }
  return null
}

function networkFailure(): RecordedDeliveryResult {
  return {
    outcome: 'retryable',
    providerRequestId: null,
    errorClass: 'provider_network_error',
    redactedDiagnostic: 'Provider request failed before a response'
  }
}

function increment(result: MeasurementDeliveryProcessResult, outcome: RecordedDeliveryResult['outcome']) {
  if (outcome === 'accepted') result.accepted += 1
  else if (outcome === 'retryable') result.retryable += 1
  else if (outcome === 'permanent_failure') result.permanentFailure += 1
  else result.policySkipped += 1
}

export function createMeasurementDeliveryProcessor(deps: DeliveryProcessorDeps) {
  return {
    async process(message: MeasurementDeliveryMessage): Promise<MeasurementDeliveryProcessResult> {
      const result: MeasurementDeliveryProcessResult = {
        claimed: 0,
        accepted: 0,
        retryable: 0,
        permanentFailure: 0,
        policySkipped: 0
      }
      const workerId = deps.workerId()

      while (result.claimed < 100) {
        const claim = await deps.repository.claimNext(message, workerId, deps.now())
        if (!claim) break
        result.claimed += 1

        let deliveryResult = policyFailure(claim)
        if (!deliveryResult && claim.platform === 'meta') {
          if (!claim.credentialRef) {
            deliveryResult = {
              outcome: 'permanent_failure',
              providerRequestId: null,
              errorClass: 'meta_capi_credential_ref_required',
              redactedDiagnostic: 'Meta CAPI requires a purpose-scoped secret binding'
            }
          } else {
            try {
              const accessToken = await deps.resolveProviderCredential(claim.credentialRef)
              deliveryResult = accessToken
                ? await deps.deliverMeta({
                    delivery: claim,
                    accessToken,
                    graphApiVersion: deps.metaGraphApiVersion,
                    fetch: deps.fetch
                  })
                : {
                    outcome: 'permanent_failure',
                    providerRequestId: null,
                    errorClass: 'meta_capi_credential_unavailable',
                    redactedDiagnostic: 'Meta CAPI secret binding is unavailable'
                  }
            } catch {
              deliveryResult = networkFailure()
            }
          }
        }

        if (!deliveryResult && claim.platform === 'google_data_manager') {
          if (!claim.connectionScopes.includes(GOOGLE_DATA_MANAGER_SCOPE)) {
            deliveryResult = {
              outcome: 'policy_skipped',
              providerRequestId: null,
              errorClass: 'google_datamanager_reconsent_required',
              redactedDiagnostic: 'Google connection must be re-consented for Data Manager'
            }
          } else if (!claim.refreshToken || !deps.googleClientId || !deps.googleClientSecret) {
            deliveryResult = {
              outcome: 'permanent_failure',
              providerRequestId: null,
              errorClass: 'google_credential_missing',
              redactedDiagnostic: 'Google Data Manager OAuth is not configured'
            }
          } else {
            try {
              const accessToken = await deps.refreshGoogleAccessToken({
                refreshToken: claim.refreshToken,
                clientId: deps.googleClientId,
                clientSecret: deps.googleClientSecret,
                fetch: deps.fetch
              })
              deliveryResult = await deps.deliverGoogle({
                delivery: claim,
                accessToken,
                fetch: deps.fetch
              })
            } catch (error) {
              deliveryResult = error instanceof GoogleOAuthRefreshError && !error.retryable
                ? {
                    outcome: 'permanent_failure',
                    providerRequestId: null,
                    errorClass: 'google_oauth_reconsent_required',
                    redactedDiagnostic: 'Google OAuth grant is no longer valid'
                  }
                : networkFailure()
            }
          }
        }

        if (!deliveryResult && claim.platform === 'tiktok') {
          if (!claim.credentialRef) {
            deliveryResult = {
              outcome: 'permanent_failure',
              providerRequestId: null,
              errorClass: 'tiktok_events_api_credential_unavailable',
              redactedDiagnostic: 'TikTok Events API secret binding is unavailable'
            }
          } else {
            try {
              const accessToken = await deps.resolveProviderCredential(claim.credentialRef)
              deliveryResult = accessToken
                ? await deps.deliverTikTok({
                    delivery: claim,
                    accessToken,
                    environment: 'live',
                    fetch: deps.fetch
                  })
                : {
                    outcome: 'permanent_failure',
                    providerRequestId: null,
                    errorClass: 'tiktok_events_api_credential_unavailable',
                    redactedDiagnostic: 'TikTok Events API secret binding is unavailable'
                  }
            } catch {
              deliveryResult = networkFailure()
            }
          }
        }

        if (!deliveryResult) {
          deliveryResult = {
            outcome: 'permanent_failure',
            providerRequestId: null,
            errorClass: 'unsupported_measurement_platform',
            redactedDiagnostic: 'Measurement platform is not supported'
          }
        }

        await deps.repository.complete(claim, deliveryResult, deps.now())
        increment(result, deliveryResult.outcome)
      }

      if (result.claimed === 100) {
        throw new Error('Measurement delivery batch exceeded safety limit')
      }
      return result
    }
  }
}
