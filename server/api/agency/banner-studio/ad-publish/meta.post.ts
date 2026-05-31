/**
 * Publish banner to Meta Ads as a real ad creative + ad.
 * POST /api/agency/banner-studio/ad-publish/meta
 *
 * Flow:
 * 1. Validate inputs + check connection has ads_management scope
 * 2. Fetch published banner from DB
 * 3. Fetch banner image from R2 URL
 * 4. Upload image to Meta → get image_hash
 * 5. Create ad creative → get creative_id
 * 6. Create ad in ad set → get ad_id
 * 7. INSERT banner_ad_publishes with all IDs
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import {
  uploadAdImage,
  uploadAdImageByUrl,
  createAdCreative,
  createAd
} from '~~/server/utils/metaClient'

const SAFE_URL_RE = /^https?:\/\/(?!localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|0\.0\.0\.0|\[?::1\]?)/i
const MAX_PRIMARY_TEXT = 250
const MAX_HEADLINE = 40
const MAX_DESCRIPTION = 30
const HTML_STRIP_RE = /<[^>]*>/g

function stripHtml(text: string): string {
  return text.replace(HTML_STRIP_RE, '').trim()
}

function sanitizeTexts(texts: string[], maxLen: number): string[] {
  return texts
    .map(t => stripHtml(t).slice(0, maxLen))
    .filter(t => t.length > 0)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const {
    publishedId,
    connectionId,
    campaignId,
    adSetId,
    pageId,
    primaryTexts,
    headlines,
    descriptions,
    callToAction,
    linkUrl,
    adName,
    status: adStatus
  } = body as {
    publishedId: string
    connectionId: string
    campaignId: string
    adSetId: string
    pageId: string
    primaryTexts: string[]
    headlines: string[]
    descriptions: string[]
    callToAction: string
    linkUrl: string
    adName?: string
    status?: string
  }

  // --- Validate required fields ---
  if (!publishedId || !connectionId || !campaignId || !adSetId || !pageId) {
    throw createError({ statusCode: 400, statusMessage: 'publishedId, connectionId, campaignId, adSetId, and pageId are required' })
  }
  if (!primaryTexts?.length || !headlines?.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one primaryText and one headline are required' })
  }
  if (!callToAction) {
    throw createError({ statusCode: 400, statusMessage: 'callToAction is required' })
  }
  if (!linkUrl || !SAFE_URL_RE.test(linkUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'linkUrl must be a valid public http/https URL' })
  }

  // Sanitize text arrays
  const cleanPrimaryTexts = sanitizeTexts(primaryTexts, MAX_PRIMARY_TEXT)
  const cleanHeadlines = sanitizeTexts(headlines, MAX_HEADLINE)
  const cleanDescriptions = sanitizeTexts(descriptions || [], MAX_DESCRIPTION)

  if (!cleanPrimaryTexts.length || !cleanHeadlines.length) {
    throw createError({ statusCode: 400, statusMessage: 'Primary texts and headlines cannot be empty after sanitization' })
  }

  // --- Fetch connection and verify scope ---
  const connection = await queryOne(`
    SELECT id, account_id AS "accountId", account_name AS "accountName",
      access_token AS "accessToken", metadata, scopes,
      token_expires_at AS "tokenExpiresAt"
    FROM social_connections
    WHERE id = $1 AND platform = 'meta' AND status = 'active'
  `, [connectionId]) as any

  if (!connection) {
    throw createError({ statusCode: 404, statusMessage: 'Meta Ads connection not found' })
  }

  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) < new Date()) {
    throw createError({ statusCode: 401, statusMessage: 'Meta token has expired. Please reconnect.' })
  }

  const scopes: string[] = connection.scopes || []
  if (!scopes.includes('ads_management')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This connection does not have ads_management permission. Please reconnect with updated permissions.'
    })
  }

  // --- Fetch published banner ---
  const published = await queryOne(`
    SELECT id, project_id AS "projectId", format_key AS "formatKey",
      url, width, height, click_url AS "clickUrl"
    FROM banner_published WHERE id = $1
  `, [publishedId]) as any

  if (!published) {
    throw createError({ statusCode: 404, statusMessage: 'Published banner not found' })
  }

  const actId = connection.metadata?.actId || `act_${connection.accountId}`
  const creativeName = adName || `Banner ${published.formatKey} - ${new Date().toISOString().slice(0, 10)}`
  const finalAdName = adName || `Ad ${published.formatKey} - ${new Date().toISOString().slice(0, 10)}`
  const finalStatus = adStatus || 'PAUSED'

  try {
    // Step 1: Upload image to Meta
    // Try URL-based upload first (faster, avoids downloading the image), fall back to buffer
    let imageResult: { hash: string; url: string }
    if (published.url && SAFE_URL_RE.test(published.url)) {
      try {
        imageResult = await uploadAdImageByUrl(actId, connection.accessToken, published.url)
      } catch {
        // Fallback: fetch the image and upload as buffer
        const imageResponse = await fetch(published.url)
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch banner image: ${imageResponse.status}`)
        }
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
        imageResult = await uploadAdImage(actId, connection.accessToken, imageBuffer)
      }
    } else {
      throw createError({ statusCode: 400, statusMessage: 'Published banner has no valid URL for image upload' })
    }

    await delay(200) // Rate limit spacing

    // Step 2: Create ad creative
    const creative = await createAdCreative(actId, connection.accessToken, {
      name: creativeName,
      imageHash: imageResult.hash,
      pageId,
      primaryTexts: cleanPrimaryTexts,
      headlines: cleanHeadlines,
      descriptions: cleanDescriptions,
      callToAction,
      linkUrl
    })

    await delay(200)

    // Step 3: Create ad
    const ad = await createAd(actId, connection.accessToken, {
      name: finalAdName,
      adsetId: adSetId,
      creativeId: creative.id,
      status: finalStatus
    })

    // Step 4: Record in DB
    const adPublish = await queryOne(`
      INSERT INTO banner_ad_publishes (
        project_id, published_id, platform, account_id, campaign_id, ad_group_id,
        ad_id, creative_id, image_hash, page_id,
        primary_texts, headlines, descriptions, call_to_action, link_url,
        ad_status, status, published_by, published_at, metadata
      )
      VALUES (
        $1, $2, 'meta_ads', $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, 'pending_review', $16, NOW(), $17
      )
      RETURNING
        id, project_id AS "projectId", published_id AS "publishedId",
        platform, account_id AS "accountId", campaign_id AS "campaignId",
        ad_group_id AS "adGroupId", ad_id AS "adId",
        creative_id AS "creativeId", status, ad_status AS "adStatus",
        published_at AS "publishedAt"
    `, [
      published.projectId,    // $1
      publishedId,            // $2
      connection.accountId,   // $3
      campaignId,             // $4
      adSetId,                // $5
      ad.id,                  // $6
      creative.id,            // $7
      imageResult.hash,       // $8
      pageId,                 // $9
      cleanPrimaryTexts,      // $10
      cleanHeadlines,         // $11
      cleanDescriptions,      // $12
      callToAction,           // $13
      linkUrl,                // $14
      finalStatus,            // $15
      user.id,                // $16
      JSON.stringify({        // $17
        imageUrl: imageResult.url,
        adAccountName: connection.accountName,
        formatKey: published.formatKey,
        width: published.width,
        height: published.height
      })
    ])

    return adPublish
  } catch (err: any) {
    // If it's already a createError, re-throw
    if (err.statusCode) throw err

    // Log the error and record failure in DB
    console.error('[Meta Ad Publish] Error:', err.message || err)

    await queryOne(`
      INSERT INTO banner_ad_publishes (
        project_id, published_id, platform, account_id, campaign_id, ad_group_id,
        page_id, primary_texts, headlines, descriptions, call_to_action, link_url,
        status, error_message, published_by, metadata
      )
      VALUES ($1, $2, 'meta_ads', $3, $4, $5, $6, $7, $8, $9, $10, $11, 'error', $12, $13, $14)
      RETURNING id
    `, [
      published.projectId,
      publishedId,
      connection.accountId,
      campaignId,
      adSetId,
      pageId,
      cleanPrimaryTexts,
      cleanHeadlines,
      cleanDescriptions,
      callToAction,
      linkUrl,
      err.message || 'Unknown error',
      user.id,
      JSON.stringify({ formatKey: published.formatKey })
    ])

    throw createError({ statusCode: 500, statusMessage: `Meta Ads publish failed: ${err.message}` })
  }
})
