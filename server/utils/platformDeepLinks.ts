/**
 * Platform Deep Links — build URLs to open campaigns in their native ad platform dashboards.
 * Pure function, no DB calls. Caller passes connection data.
 */

export function buildCampaignDeepLink(
  platform: string,
  campaignId: string | null,
  connection: { accountId: string; metadata: any } | null
): string | null {
  if (!connection) return null

  const { accountId, metadata } = connection

  switch (platform) {
    case 'meta': {
      // Ads Manager URLs use just the numeric account ID (no act_ prefix)
      const rawActId = (metadata?.actId || accountId).replace(/^act_/, '')
      if (!campaignId) return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(rawActId)}`
      return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(rawActId)}&selected_campaign_ids=${encodeURIComponent(campaignId)}`
    }

    case 'google_ads': {
      const cleanId = accountId.replace(/-/g, '')
      if (!campaignId) return `https://ads.google.com/aw/campaigns?ocid=${encodeURIComponent(cleanId)}`
      return `https://ads.google.com/aw/campaigns?campaignId=${encodeURIComponent(campaignId)}&ocid=${encodeURIComponent(cleanId)}`
    }

    case 'microsoft_ads': {
      const customerId = metadata?.customerId || ''
      return `https://ui.ads.microsoft.com/campaign/Campaigns?aid=${encodeURIComponent(accountId)}&cid=${encodeURIComponent(customerId)}`
    }

    case 'tiktok':
      return `https://ads.tiktok.com/i18n/perf?aadvid=${encodeURIComponent(accountId)}`

    case 'linkedin':
      return `https://www.linkedin.com/campaignmanager/accounts/${encodeURIComponent(accountId)}/campaigns`

    case 'pinterest':
      return `https://ads.pinterest.com/advertiser/${encodeURIComponent(accountId)}/reporting/`

    case 'snapchat': {
      const orgId = metadata?.orgId || accountId
      return `https://ads.snapchat.com/${encodeURIComponent(orgId)}/campaigns`
    }

    case 'twitter':
      if (!campaignId) return `https://ads.x.com/`
      return `https://ads.x.com/campaign_form/${encodeURIComponent(campaignId)}`

    default:
      return null
  }
}
