/**
 * Microsoft Ads (Bing) API Client
 * Uses Microsoft Advertising API v13 with async reporting pattern.
 * OAuth via Microsoft Identity Platform (v2.0).
 * https://learn.microsoft.com/en-us/advertising/guides/
 */

import { ofetch } from 'ofetch'

export const MICROSOFT_ADS_API_BASE = 'https://campaign.api.bingads.microsoft.com/Api/Advertiser/V13'
export const MICROSOFT_REPORTING_BASE = 'https://reporting.api.bingads.microsoft.com/Api/Advertiser/V13/Reporting'
export const MICROSOFT_CUSTOMER_BASE = 'https://clientcenter.api.bingads.microsoft.com/Api/CustomerManagement/V13'

// ============================================
// Types
// ============================================

export interface MicrosoftAdAccount {
  account_id: string
  account_name: string
  account_number: string
  currency: string
  status: string
  customer_id: string
}

export interface MicrosoftCampaignReport {
  campaign_id: string
  campaign_name: string
  spend: string
  impressions: string
  clicks: string
  conversions: string
  revenue: string
  date: string
}

export interface MicrosoftTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

interface ReportPollResult {
  status: 'Pending' | 'InProgress' | 'Success' | 'Error'
  downloadUrl?: string
}

// ============================================
// OAuth Helpers
// ============================================

/**
 * Build the Microsoft OAuth authorization URL.
 * Uses Microsoft Identity Platform v2.0.
 */
export function getMicrosoftAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'https://ads.microsoft.com/msads.manage offline_access',
    state,
  })
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeMicrosoftToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<MicrosoftTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'https://ads.microsoft.com/msads.manage offline_access',
  })

  const res = await ofetch<MicrosoftTokenResponse>(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  )

  return res
}

/**
 * Refresh an expired access token using a refresh token.
 */
export async function refreshMicrosoftToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<MicrosoftTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'https://ads.microsoft.com/msads.manage offline_access',
  })

  const res = await ofetch<MicrosoftTokenResponse>(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  )

  return res
}

// ============================================
// Account Endpoints
// ============================================

/**
 * Get Microsoft Ads accounts accessible by the token.
 * Uses the Customer Management Service SOAP API (simplified via REST-like wrapper).
 */
export async function getMicrosoftAdAccounts(
  accessToken: string,
  developerToken: string,
  customerId?: string
): Promise<MicrosoftAdAccount[]> {
  // Use the Accounts/Get endpoint to list accounts under the customer
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header>
    <h:AuthenticationToken xmlns:h="https://bingads.microsoft.com/Customer/v13">${escapeXml(accessToken)}</h:AuthenticationToken>
    <h:DeveloperToken xmlns:h="https://bingads.microsoft.com/Customer/v13">${escapeXml(developerToken)}</h:DeveloperToken>
  </s:Header>
  <s:Body>
    <GetAccountsInfoRequest xmlns="https://bingads.microsoft.com/Customer/v13">
      ${customerId ? `<CustomerId>${escapeXml(customerId)}</CustomerId>` : ''}
      <OnlyParentAccounts>false</OnlyParentAccounts>
    </GetAccountsInfoRequest>
  </s:Body>
</s:Envelope>`

  const res = await microsoftFetch(
    'https://clientcenter.api.bingads.microsoft.com/Api/CustomerManagement/v13/CustomerManagementService.svc',
    accessToken,
    developerToken,
    soapBody,
    'GetAccountsInfo'
  )

  // Parse SOAP response for account info
  const accounts: MicrosoftAdAccount[] = []
  const accountMatches = res.matchAll(/<AccountInfo[^>]*>([\s\S]*?)<\/AccountInfo>/g)
  for (const match of accountMatches) {
    const xml = match[1]
    accounts.push({
      account_id: extractXmlValue(xml, 'Id') || '',
      account_name: extractXmlValue(xml, 'Name') || '',
      account_number: extractXmlValue(xml, 'Number') || '',
      currency: extractXmlValue(xml, 'CurrencyCode') || 'USD',
      status: extractXmlValue(xml, 'AccountLifeCycleStatus') || 'Active',
      customer_id: customerId || extractXmlValue(xml, 'ParentCustomerId') || '',
    })
  }

  return accounts
}

/**
 * Get the user's customer info (needed to discover customer_id).
 */
export async function getMicrosoftUser(
  accessToken: string,
  developerToken: string
): Promise<{ customerId: string; userId: string }> {
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header>
    <h:AuthenticationToken xmlns:h="https://bingads.microsoft.com/Customer/v13">${escapeXml(accessToken)}</h:AuthenticationToken>
    <h:DeveloperToken xmlns:h="https://bingads.microsoft.com/Customer/v13">${escapeXml(developerToken)}</h:DeveloperToken>
  </s:Header>
  <s:Body>
    <GetUser xmlns="https://bingads.microsoft.com/Customer/v13">
      <UserId xmlns:i="http://www.w3.org/2001/XMLSchema-instance" i:nil="true"/>
    </GetUser>
  </s:Body>
</s:Envelope>`

  const res = await microsoftFetch(
    'https://clientcenter.api.bingads.microsoft.com/Api/CustomerManagement/v13/CustomerManagementService.svc',
    accessToken,
    developerToken,
    soapBody,
    'GetUser'
  )

  const customerId = extractXmlValue(res, 'CustomerId') || ''
  const userId = extractXmlValue(res, 'Id') || ''

  return { customerId, userId }
}

// ============================================
// Async Reporting Pattern
// ============================================

/**
 * Submit a campaign performance report request.
 * Returns a reportRequestId to poll for status.
 */
export async function submitCampaignReport(
  accountId: string,
  accessToken: string,
  developerToken: string,
  month: number,
  year: number
): Promise<string> {
  const { since, until } = getMonthRange(month, year)

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header>
    <h:AuthenticationToken xmlns:h="https://bingads.microsoft.com/Reporting/v13">${escapeXml(accessToken)}</h:AuthenticationToken>
    <h:DeveloperToken xmlns:h="https://bingads.microsoft.com/Reporting/v13">${escapeXml(developerToken)}</h:DeveloperToken>
  </s:Header>
  <s:Body>
    <SubmitGenerateReportRequest xmlns="https://bingads.microsoft.com/Reporting/v13">
      <ReportRequest xmlns:i="http://www.w3.org/2001/XMLSchema-instance" i:type="CampaignPerformanceReportRequest">
        <ExcludeColumnHeaders>false</ExcludeColumnHeaders>
        <ExcludeReportFooter>true</ExcludeReportFooter>
        <ExcludeReportHeader>true</ExcludeReportHeader>
        <Format>Csv</Format>
        <ReturnOnlyCompleteData>false</ReturnOnlyCompleteData>
        <Aggregation>Summary</Aggregation>
        <Columns>
          <CampaignPerformanceReportColumn>CampaignId</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>CampaignName</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>Spend</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>Impressions</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>Clicks</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>Conversions</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>Revenue</CampaignPerformanceReportColumn>
        </Columns>
        <Scope>
          <AccountIds xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:long>${escapeXml(accountId)}</a:long>
          </AccountIds>
        </Scope>
        <Time>
          <CustomDateRangeStart>
            <Day>1</Day>
            <Month>${month}</Month>
            <Year>${year}</Year>
          </CustomDateRangeStart>
          <CustomDateRangeEnd>
            <Day>${new Date(year, month, 0).getDate()}</Day>
            <Month>${month}</Month>
            <Year>${year}</Year>
          </CustomDateRangeEnd>
        </Time>
      </ReportRequest>
    </SubmitGenerateReportRequest>
  </s:Body>
</s:Envelope>`

  const res = await microsoftFetch(
    'https://reporting.api.bingads.microsoft.com/Api/Advertiser/v13/ReportingService.svc',
    accessToken,
    developerToken,
    soapBody,
    'SubmitGenerateReport'
  )

  const requestId = extractXmlValue(res, 'ReportRequestId')
  if (!requestId) {
    throw new Error('Microsoft Ads: No report request ID returned')
  }

  return requestId
}

/**
 * Submit a daily campaign performance report request.
 */
export async function submitDailyReport(
  accountId: string,
  accessToken: string,
  developerToken: string,
  month: number,
  year: number
): Promise<string> {
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header>
    <h:AuthenticationToken xmlns:h="https://bingads.microsoft.com/Reporting/v13">${escapeXml(accessToken)}</h:AuthenticationToken>
    <h:DeveloperToken xmlns:h="https://bingads.microsoft.com/Reporting/v13">${escapeXml(developerToken)}</h:DeveloperToken>
  </s:Header>
  <s:Body>
    <SubmitGenerateReportRequest xmlns="https://bingads.microsoft.com/Reporting/v13">
      <ReportRequest xmlns:i="http://www.w3.org/2001/XMLSchema-instance" i:type="CampaignPerformanceReportRequest">
        <ExcludeColumnHeaders>false</ExcludeColumnHeaders>
        <ExcludeReportFooter>true</ExcludeReportFooter>
        <ExcludeReportHeader>true</ExcludeReportHeader>
        <Format>Csv</Format>
        <ReturnOnlyCompleteData>false</ReturnOnlyCompleteData>
        <Aggregation>Daily</Aggregation>
        <Columns>
          <CampaignPerformanceReportColumn>TimePeriod</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>CampaignId</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>CampaignName</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>Spend</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>Impressions</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>Clicks</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>Conversions</CampaignPerformanceReportColumn>
          <CampaignPerformanceReportColumn>Revenue</CampaignPerformanceReportColumn>
        </Columns>
        <Scope>
          <AccountIds xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:long>${escapeXml(accountId)}</a:long>
          </AccountIds>
        </Scope>
        <Time>
          <CustomDateRangeStart>
            <Day>1</Day>
            <Month>${month}</Month>
            <Year>${year}</Year>
          </CustomDateRangeStart>
          <CustomDateRangeEnd>
            <Day>${new Date(year, month, 0).getDate()}</Day>
            <Month>${month}</Month>
            <Year>${year}</Year>
          </CustomDateRangeEnd>
        </Time>
      </ReportRequest>
    </SubmitGenerateReportRequest>
  </s:Body>
</s:Envelope>`

  const res = await microsoftFetch(
    'https://reporting.api.bingads.microsoft.com/Api/Advertiser/v13/ReportingService.svc',
    accessToken,
    developerToken,
    soapBody,
    'SubmitGenerateReport'
  )

  const requestId = extractXmlValue(res, 'ReportRequestId')
  if (!requestId) {
    throw new Error('Microsoft Ads: No daily report request ID returned')
  }

  return requestId
}

/**
 * Poll report status until it is complete or times out.
 * Polls every 5s, max 60s timeout.
 * Returns download URL on success.
 */
export async function pollReportStatus(
  requestId: string,
  accessToken: string,
  developerToken: string,
  maxTimeoutMs = 60000,
  pollIntervalMs = 5000
): Promise<string> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxTimeoutMs) {
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header>
    <h:AuthenticationToken xmlns:h="https://bingads.microsoft.com/Reporting/v13">${escapeXml(accessToken)}</h:AuthenticationToken>
    <h:DeveloperToken xmlns:h="https://bingads.microsoft.com/Reporting/v13">${escapeXml(developerToken)}</h:DeveloperToken>
  </s:Header>
  <s:Body>
    <PollGenerateReportRequest xmlns="https://bingads.microsoft.com/Reporting/v13">
      <ReportRequestId>${escapeXml(requestId)}</ReportRequestId>
    </PollGenerateReportRequest>
  </s:Body>
</s:Envelope>`

    const res = await microsoftFetch(
      'https://reporting.api.bingads.microsoft.com/Api/Advertiser/v13/ReportingService.svc',
      accessToken,
      developerToken,
      soapBody,
      'PollGenerateReport'
    )

    const status = extractXmlValue(res, 'Status')

    if (status === 'Success') {
      const downloadUrl = extractXmlValue(res, 'ReportDownloadUrl')
      if (!downloadUrl) {
        throw new Error('Microsoft Ads: Report succeeded but no download URL returned')
      }
      return downloadUrl
    }

    if (status === 'Error') {
      throw new Error('Microsoft Ads: Report generation failed')
    }

    // Pending or InProgress — wait and retry
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(`Microsoft Ads: Report polling timed out after ${maxTimeoutMs / 1000}s`)
}

/**
 * Download and parse the CSV report from Microsoft Ads.
 * Returns parsed campaign rows.
 */
export async function downloadAndParseReport(
  url: string,
  accessToken: string
): Promise<MicrosoftCampaignReport[]> {
  const csvText = await ofetch<string>(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    responseType: 'text',
  })

  return parseCsvReport(csvText)
}

/**
 * High-level function: submit → poll → download → parse.
 * Chains the full async reporting flow for monthly campaign insights.
 */
export async function getMicrosoftCampaignInsights(
  accountId: string,
  accessToken: string,
  developerToken: string,
  month: number,
  year: number
): Promise<MicrosoftCampaignReport[]> {
  const requestId = await submitCampaignReport(accountId, accessToken, developerToken, month, year)
  const downloadUrl = await pollReportStatus(requestId, accessToken, developerToken)
  const campaigns = await downloadAndParseReport(downloadUrl, accessToken)
  return campaigns
}

/**
 * High-level function for daily campaign insights.
 */
export async function getMicrosoftDailyInsights(
  accountId: string,
  accessToken: string,
  developerToken: string,
  month: number,
  year: number
): Promise<MicrosoftCampaignReport[]> {
  const requestId = await submitDailyReport(accountId, accessToken, developerToken, month, year)
  const downloadUrl = await pollReportStatus(requestId, accessToken, developerToken)
  const rows = await downloadAndParseReport(downloadUrl, accessToken)
  return rows
}

// ============================================
// Breakdown Reports (Age/Gender, Device, Geo)
// ============================================

export interface MicrosoftBreakdownRow {
  campaignId: string
  dimensionType: string
  dimensionValue: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
}

/**
 * Submit, poll, and parse a breakdown report.
 * @param reportType 'AgeGender' | 'Device' | 'Geographic'
 */
export async function getBreakdownReport(
  accountId: string,
  accessToken: string,
  developerToken: string,
  month: number,
  year: number,
  reportType: 'AgeGender' | 'Device' | 'Geographic'
): Promise<MicrosoftBreakdownRow[]> {
  const reportConfig = getBreakdownReportConfig(reportType, accountId, month, year)

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header>
    <h:AuthenticationToken xmlns:h="https://bingads.microsoft.com/Reporting/v13">${escapeXml(accessToken)}</h:AuthenticationToken>
    <h:DeveloperToken xmlns:h="https://bingads.microsoft.com/Reporting/v13">${escapeXml(developerToken)}</h:DeveloperToken>
  </s:Header>
  <s:Body>
    <SubmitGenerateReportRequest xmlns="https://bingads.microsoft.com/Reporting/v13">
      <ReportRequest xmlns:i="http://www.w3.org/2001/XMLSchema-instance" i:type="${reportConfig.requestType}">
        <ExcludeColumnHeaders>false</ExcludeColumnHeaders>
        <ExcludeReportFooter>true</ExcludeReportFooter>
        <ExcludeReportHeader>true</ExcludeReportHeader>
        <Format>Csv</Format>
        <ReturnOnlyCompleteData>false</ReturnOnlyCompleteData>
        <Aggregation>Summary</Aggregation>
        <Columns>${reportConfig.columns}</Columns>
        <Scope>
          <AccountIds xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:long>${escapeXml(accountId)}</a:long>
          </AccountIds>
        </Scope>
        <Time>
          <CustomDateRangeStart>
            <Day>1</Day>
            <Month>${month}</Month>
            <Year>${year}</Year>
          </CustomDateRangeStart>
          <CustomDateRangeEnd>
            <Day>${new Date(year, month, 0).getDate()}</Day>
            <Month>${month}</Month>
            <Year>${year}</Year>
          </CustomDateRangeEnd>
        </Time>
      </ReportRequest>
    </SubmitGenerateReportRequest>
  </s:Body>
</s:Envelope>`

  try {
    const res = await microsoftFetch(
      'https://reporting.api.bingads.microsoft.com/Api/Advertiser/v13/ReportingService.svc',
      accessToken, developerToken, soapBody, 'SubmitGenerateReport'
    )
    const requestId = extractXmlValue(res, 'ReportRequestId')
    if (!requestId) return []

    const downloadUrl = await pollReportStatus(requestId, accessToken, developerToken, 30000)
    const csvText = await ofetch<string>(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'text',
    })

    return parseBreakdownCsv(csvText, reportType)
  } catch (err: any) {
    console.warn(`[MicrosoftAds] Breakdown report ${reportType} failed:`, err.message)
    return []
  }
}

function getBreakdownReportConfig(type: 'AgeGender' | 'Device' | 'Geographic', _accountId: string, _month: number, _year: number) {
  const colTag = (rt: string, col: string) => `<${rt}ReportColumn>${col}</${rt}ReportColumn>`

  switch (type) {
    case 'AgeGender':
      return {
        requestType: 'AgeGenderAudienceReportRequest',
        columns: ['CampaignId', 'AgeGroup', 'Gender', 'Spend', 'Impressions', 'Clicks', 'Conversions', 'Revenue']
          .map(c => colTag('AgeGenderAudienceReport', c)).join('\n          ')
      }
    case 'Device':
      return {
        requestType: 'DeviceOSPerformanceReportRequest' as const,
        columns: ['CampaignId', 'DeviceType', 'Spend', 'Impressions', 'Clicks', 'Conversions', 'Revenue']
          .map(c => colTag('DeviceOSPerformanceReport', c)).join('\n          ')
      }
    case 'Geographic':
      return {
        requestType: 'GeographicPerformanceReportRequest' as const,
        columns: ['CampaignId', 'Country', 'Spend', 'Impressions', 'Clicks', 'Conversions', 'Revenue']
          .map(c => colTag('GeographicPerformanceReport', c)).join('\n          ')
      }
  }
}

function parseBreakdownCsv(csv: string, reportType: 'AgeGender' | 'Device' | 'Geographic'): MicrosoftBreakdownRow[] {
  const lines = csv.trim().split('\n').filter(line => line.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''))
  const results: MicrosoftBreakdownRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] || '' })

    const campaignId = row['CampaignId'] || ''
    const spend = parseFloat(row['Spend'] || '0')
    const impressions = parseInt(row['Impressions'] || '0', 10)
    const clicks = parseInt(row['Clicks'] || '0', 10)
    const conversions = parseFloat(row['Conversions'] || '0')
    const revenue = parseFloat(row['Revenue'] || '0')

    if (reportType === 'AgeGender') {
      if (row['AgeGroup']) {
        results.push({ campaignId, dimensionType: 'age', dimensionValue: normalizeMsAge(row['AgeGroup']), spend, impressions, clicks, conversions, revenue })
      }
      if (row['Gender']) {
        results.push({ campaignId, dimensionType: 'gender', dimensionValue: normalizeMsGender(row['Gender']), spend, impressions, clicks, conversions, revenue })
      }
    } else if (reportType === 'Device') {
      results.push({ campaignId, dimensionType: 'device', dimensionValue: normalizeMsDevice(row['DeviceType'] || ''), spend, impressions, clicks, conversions, revenue })
    } else if (reportType === 'Geographic') {
      results.push({ campaignId, dimensionType: 'geo', dimensionValue: row['Country'] || 'unknown', spend, impressions, clicks, conversions, revenue })
    }
  }

  return results
}

function normalizeMsAge(val: string): string {
  const map: Record<string, string> = {
    'EighteenToTwentyFour': '18-24', 'TwentyFiveToThirtyFour': '25-34',
    'ThirtyFiveToFortyNine': '35-49', 'FiftyToSixtyFour': '50-64',
    'SixtyFiveAndAbove': '65+', 'Unknown': 'unknown',
  }
  return map[val] || 'unknown'
}

function normalizeMsGender(val: string): string {
  return val.toLowerCase() === 'male' ? 'male' : val.toLowerCase() === 'female' ? 'female' : 'unknown'
}

function normalizeMsDevice(val: string): string {
  const v = val.toLowerCase()
  if (v.includes('mobile') || v.includes('smartphone')) return 'mobile'
  if (v.includes('tablet')) return 'tablet'
  if (v.includes('computer') || v.includes('desktop')) return 'desktop'
  return 'other'
}

// ============================================
// Helpers
// ============================================

/**
 * SOAP fetch wrapper for Microsoft Ads with retry on 429/500.
 */
async function microsoftFetch(
  url: string,
  accessToken: string,
  developerToken: string,
  soapBody: string,
  soapAction: string,
  retries = 3
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await ofetch<string>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: soapAction,
        },
        body: soapBody,
        responseType: 'text',
      })
      return res
    } catch (err: any) {
      const status = err?.status || err?.statusCode
      if ((status === 429 || status === 500) && attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('Microsoft Ads API: max retries exceeded')
}

/**
 * Parse a CSV report string into MicrosoftCampaignReport rows.
 * Handles both summary (no date column) and daily (with TimePeriod) formats.
 */
function parseCsvReport(csv: string): MicrosoftCampaignReport[] {
  const lines = csv.trim().split('\n').filter(line => line.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''))
  const results: MicrosoftCampaignReport[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] || ''
    })

    results.push({
      campaign_id: row['CampaignId'] || '',
      campaign_name: row['CampaignName'] || '',
      spend: row['Spend'] || '0',
      impressions: row['Impressions'] || '0',
      clicks: row['Clicks'] || '0',
      conversions: row['Conversions'] || '0',
      revenue: row['Revenue'] || '0',
      date: row['TimePeriod'] || row['GregorianDate'] || '',
    })
  }

  return results
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Get first and last day of a month as YYYY-MM-DD strings.
 */
function getMonthRange(month: number, year: number): { since: string; until: string } {
  const since = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const until = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { since, until }
}

/**
 * Extract a value from XML by tag name (simple helper, not a full parser).
 */
function extractXmlValue(xml: string, tag: string): string {
  const regex = new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([^<]*)<\\/(?:[a-z0-9]+:)?${tag}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1].trim() : ''
}

/**
 * Escape special characters for XML injection prevention.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
