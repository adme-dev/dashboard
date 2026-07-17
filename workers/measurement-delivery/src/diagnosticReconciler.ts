import type { GoogleDiagnosticResult, retrieveGoogleDataManagerRequestStatus } from './diagnostics'
import type {
  MeasurementDiagnosticClaim,
  MeasurementDiagnosticCompletion
} from './diagnosticRepository'
import {
  GoogleOAuthRefreshError,
  type refreshGoogleDataManagerAccessToken
} from './providers'

const GOOGLE_DATA_MANAGER_SCOPE = 'https://www.googleapis.com/auth/datamanager'
const MAX_DIAGNOSTIC_AGE_MS = 24 * 60 * 60 * 1000

interface DiagnosticRepository {
  claimNext(workerId: string, now: Date): Promise<MeasurementDiagnosticClaim | null>
  complete(
    claim: MeasurementDiagnosticClaim,
    result: MeasurementDiagnosticCompletion,
    now: Date
  ): Promise<void>
}

interface ReconcilerDeps {
  repository: DiagnosticRepository
  retrieve: typeof retrieveGoogleDataManagerRequestStatus
  refreshGoogleAccessToken: typeof refreshGoogleDataManagerAccessToken
  workerId: () => string
  now: () => Date
  random: () => number
  googleClientId: string
  googleClientSecret: string
  fetch: typeof fetch
}

export interface MeasurementDiagnosticReconcileResult {
  checked: number
  delivered: number
  processing: number
  failed: number
}

function nextCheckAt(claim: MeasurementDiagnosticClaim, now: Date, random: number): string {
  const baseMinutes = 30 * (1.3 ** claim.checkNumber)
  const jitter = 0.9 + Math.max(0, Math.min(1, random)) * 0.2
  const minutes = Math.min(60, baseMinutes * jitter)
  return new Date(now.getTime() + minutes * 60 * 1000).toISOString()
}

function timedOut(claim: MeasurementDiagnosticClaim, now: Date): boolean {
  const startedAt = new Date(claim.startedAt).getTime()
  return !Number.isFinite(startedAt) || now.getTime() - startedAt >= MAX_DIAGNOSTIC_AGE_MS
}

function processingCompletion(
  claim: MeasurementDiagnosticClaim,
  now: Date,
  random: number,
  errorClass: string | null,
  diagnostic: string
): MeasurementDiagnosticCompletion {
  return {
    outcome: errorClass ? 'http_failure' : 'processing',
    warningCount: 0,
    errorCount: 0,
    errorClass,
    redactedDiagnostic: diagnostic,
    nextCheckAt: nextCheckAt(claim, now, random)
  }
}

function terminalCompletion(result: GoogleDiagnosticResult): MeasurementDiagnosticCompletion {
  if (result.outcome === 'success') {
    const hasWarnings = result.warningCount > 0
    return {
      outcome: 'success',
      warningCount: result.warningCount,
      errorCount: result.errorCount,
      errorClass: hasWarnings ? 'google_diagnostics_warning' : null,
      redactedDiagnostic: hasWarnings
        ? `Google processing completed with warnings${result.reason ? `: ${result.reason}` : ''}`.slice(0, 1000)
        : null,
      nextCheckAt: null
    }
  }
  const outcome = result.outcome === 'partial_success' ? 'partial_success' : 'failed'
  return {
    outcome,
    warningCount: result.warningCount,
    errorCount: result.errorCount,
    errorClass: outcome === 'partial_success'
      ? 'google_diagnostics_partial_success'
      : 'google_diagnostics_failed',
    redactedDiagnostic: `Google processing ${outcome === 'partial_success' ? 'partially succeeded' : 'failed'}${
      result.reason ? `: ${result.reason}` : ''
    }`.slice(0, 1000),
    nextCheckAt: null
  }
}

function increment(
  summary: MeasurementDiagnosticReconcileResult,
  result: MeasurementDiagnosticCompletion
): void {
  summary.checked += 1
  if (result.outcome === 'success') summary.delivered += 1
  else if (result.outcome === 'processing' || result.outcome === 'http_failure') summary.processing += 1
  else summary.failed += 1
}

export function createMeasurementDiagnosticReconciler(deps: ReconcilerDeps) {
  return {
    async reconcile(): Promise<MeasurementDiagnosticReconcileResult> {
      const summary: MeasurementDiagnosticReconcileResult = {
        checked: 0,
        delivered: 0,
        processing: 0,
        failed: 0
      }
      const workerId = deps.workerId()

      while (summary.checked < 100) {
        const now = deps.now()
        const claim = await deps.repository.claimNext(workerId, now)
        if (!claim) break
        let completion: MeasurementDiagnosticCompletion

        if (timedOut(claim, now)) {
          completion = {
            outcome: 'timed_out',
            warningCount: 0,
            errorCount: 0,
            errorClass: 'google_diagnostics_timeout',
            redactedDiagnostic: 'Google processing did not reach terminal status within 24 hours',
            nextCheckAt: null
          }
        } else if (!claim.connectionScopes.includes(GOOGLE_DATA_MANAGER_SCOPE)) {
          completion = {
            outcome: 'credential_failure',
            warningCount: 0,
            errorCount: 0,
            errorClass: 'google_datamanager_reconsent_required',
            redactedDiagnostic: 'Google connection must be re-consented for Data Manager diagnostics',
            nextCheckAt: null
          }
        } else if (!claim.refreshToken || !deps.googleClientId || !deps.googleClientSecret) {
          completion = {
            outcome: 'credential_failure',
            warningCount: 0,
            errorCount: 0,
            errorClass: 'google_credential_missing',
            redactedDiagnostic: 'Google Data Manager diagnostics OAuth is not configured',
            nextCheckAt: null
          }
        } else {
          try {
            const accessToken = await deps.refreshGoogleAccessToken({
              refreshToken: claim.refreshToken,
              clientId: deps.googleClientId,
              clientSecret: deps.googleClientSecret,
              fetch: deps.fetch
            })
            const result = await deps.retrieve({
              requestId: claim.requestId,
              accessToken,
              fetch: deps.fetch
            })
            if (result.outcome === 'processing') {
              completion = processingCompletion(
                claim,
                now,
                deps.random(),
                null,
                'Google request is still processing'
              )
            } else if (result.outcome === 'http_failure' && result.retryable) {
              completion = processingCompletion(
                claim,
                now,
                deps.random(),
                result.reason,
                'Google diagnostics request will be retried'
              )
            } else if (result.outcome === 'http_failure') {
              completion = {
                outcome: 'failed',
                warningCount: 0,
                errorCount: 0,
                errorClass: result.reason,
                redactedDiagnostic: 'Google diagnostics request was rejected',
                nextCheckAt: null
              }
            } else {
              completion = terminalCompletion(result)
            }
          } catch (error) {
            if (error instanceof GoogleOAuthRefreshError && !error.retryable) {
              completion = {
                outcome: 'credential_failure',
                warningCount: 0,
                errorCount: 0,
                errorClass: 'google_oauth_reconsent_required',
                redactedDiagnostic: 'Google OAuth grant is no longer valid',
                nextCheckAt: null
              }
            } else {
              completion = processingCompletion(
                claim,
                now,
                deps.random(),
                'provider_network_error',
                'Google diagnostics request failed before a response'
              )
            }
          }
        }

        await deps.repository.complete(claim, completion, now)
        increment(summary, completion)
      }
      return summary
    }
  }
}
