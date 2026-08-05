import { getGoogleAiMaxRows, type GoogleAiMaxRows } from '~~/server/utils/googleAdsClient'
import {
  buildGoogleAiMaxState,
  normalizeGoogleAiMaxObservation,
  type GoogleAiMaxCampaignState,
} from '~~/server/utils/googleAiMax'

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
