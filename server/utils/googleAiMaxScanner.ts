import { getGoogleAiMaxRows, type GoogleAiMaxRows } from '~~/server/utils/googleAdsClient'
import {
  buildGoogleAiMaxState,
  normalizeGoogleAiMaxObservation,
  type GoogleAiMaxCampaignState,
} from '~~/server/utils/googleAiMax'
import {
  claimGoogleAiMaxScanRun,
  finishGoogleAiMaxScanRun,
  markGoogleAiMaxScanRunRunning,
  persistGoogleAiMaxCampaignStates,
  type GoogleAiMaxScanFailure,
  type GoogleAiMaxScanRunRef,
  type GoogleAiMaxScanTrigger,
  type PersistGoogleAiMaxCampaignStatesResult,
} from '~~/server/utils/googleAiMaxRepository'

export interface ScanGoogleAiMaxAccountInput {
  tenantId: string
  connectionId: string
  customerId: string
  accessToken: string
  developerToken: string
  loginCustomerId?: string
  observedAt: string
}

export interface ScanGoogleAiMaxAccountDependencies {
  fetchRows: (
    customerId: string,
    accessToken: string,
    developerToken: string,
    loginCustomerId?: string,
  ) => Promise<GoogleAiMaxRows>
}

const defaultDependencies: ScanGoogleAiMaxAccountDependencies = {
  fetchRows: getGoogleAiMaxRows,
}

export async function scanGoogleAiMaxAccount(
  input: ScanGoogleAiMaxAccountInput,
  dependencies: ScanGoogleAiMaxAccountDependencies = defaultDependencies,
): Promise<GoogleAiMaxCampaignState[]> {
  const { campaignRows, adGroupRows } = await dependencies.fetchRows(
    input.customerId,
    input.accessToken,
    input.developerToken,
    input.loginCustomerId,
  )

  return campaignRows.map(campaignRow => buildGoogleAiMaxState(
    normalizeGoogleAiMaxObservation({
      apiVersion: 'v23',
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      customerId: input.customerId,
      observedAt: input.observedAt,
      campaignRow,
      adGroupRows,
    }),
  ))
}

export interface GoogleAiMaxPortfolioAccount {
  connectionId: string
  customerId: string
  accessToken: string
  loginCustomerId?: string
}

export interface RunGoogleAiMaxPortfolioScanInput {
  tenantId: string
  trigger: GoogleAiMaxScanTrigger
  requestedBy?: string
  developerToken: string
  observedAt: string
  accounts: GoogleAiMaxPortfolioAccount[]
}

export interface RunGoogleAiMaxPortfolioScanDependencies {
  claimRun: typeof claimGoogleAiMaxScanRun
  markRunning: typeof markGoogleAiMaxScanRunRunning
  scanAccount: typeof scanGoogleAiMaxAccount
  persistStates: (
    input: { scanRunId: string, states: GoogleAiMaxCampaignState[] },
  ) => Promise<PersistGoogleAiMaxCampaignStatesResult>
  finishRun: typeof finishGoogleAiMaxScanRun
}

const defaultPortfolioDependencies: RunGoogleAiMaxPortfolioScanDependencies = {
  claimRun: claimGoogleAiMaxScanRun,
  markRunning: markGoogleAiMaxScanRunRunning,
  scanAccount: scanGoogleAiMaxAccount,
  persistStates: persistGoogleAiMaxCampaignStates,
  finishRun: finishGoogleAiMaxScanRun,
}

export type RunGoogleAiMaxPortfolioScanResult =
  | { accepted: false, run: null }
  | {
      accepted: true
      run: GoogleAiMaxScanRunRef
      processedConnections: number
      totalCampaigns: number
      affectedCampaigns: number
      unknownCampaigns: number
      failures: GoogleAiMaxScanFailure[]
    }

function safeFailureMessage(error: unknown, secrets: string[]): string {
  const message = error instanceof Error ? error.message : 'Unknown Google Ads scan error'
  const redacted = secrets
    .filter(secret => secret.length > 0)
    .reduce((value, secret) => value.split(secret).join('[REDACTED]'), message)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
  return redacted.slice(0, 500)
}

export async function runGoogleAiMaxPortfolioScan(
  input: RunGoogleAiMaxPortfolioScanInput,
  dependencies: RunGoogleAiMaxPortfolioScanDependencies = defaultPortfolioDependencies,
): Promise<RunGoogleAiMaxPortfolioScanResult> {
  const run = await dependencies.claimRun({
    tenantId: input.tenantId,
    trigger: input.trigger,
    requestedBy: input.requestedBy,
    totalConnections: input.accounts.length,
    apiVersion: 'v23',
  })
  if (!run) return { accepted: false, run: null }

  const started = await dependencies.markRunning({
    runId: run.id,
    tenantId: input.tenantId,
    startedAt: input.observedAt,
  })

  let processedConnections = 0
  let totalCampaigns = 0
  let affectedCampaigns = 0
  let unknownCampaigns = 0
  const failures: GoogleAiMaxScanFailure[] = []

  if (!started) {
    failures.push({
      connectionId: '__run__',
      error: 'Claimed AI Max scan could not transition from queued to running',
    })
  } else {
    for (const account of input.accounts) {
      try {
        const states = await dependencies.scanAccount({
          tenantId: input.tenantId,
          connectionId: account.connectionId,
          customerId: account.customerId,
          accessToken: account.accessToken,
          developerToken: input.developerToken,
          loginCustomerId: account.loginCustomerId,
          observedAt: input.observedAt,
        })
        await dependencies.persistStates({ scanRunId: run.id, states })
        processedConnections += 1
        totalCampaigns += states.length
        unknownCampaigns += states.filter(
          state => state.readinessStatus === 'unknown',
        ).length
        affectedCampaigns += states.filter(
          state => state.readinessStatus !== 'unknown'
            && (state.aiMaxEnabled === true || state.migrationReason !== 'none'),
        ).length
      } catch (error) {
        failures.push({
          connectionId: account.connectionId,
          customerId: account.customerId,
          error: safeFailureMessage(error, [account.accessToken, input.developerToken]),
        })
      }
    }
  }

  const finished = await dependencies.finishRun({
    runId: run.id,
    tenantId: input.tenantId,
    finishedAt: input.observedAt,
    processedConnections,
    totalCampaigns,
    affectedCampaigns,
    unknownCampaigns,
    failures,
  })
  if (!finished) throw new Error(`Failed to finish AI Max scan ${run.id}`)

  return {
    accepted: true,
    run: finished,
    processedConnections,
    totalCampaigns,
    affectedCampaigns,
    unknownCampaigns,
    failures,
  }
}
