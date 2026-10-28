import { z } from 'zod'

const id = z.string().regex(/^\d{1,30}$/)
const client = z.strictObject({ clientId: z.string().uuid() })
const texts = (max: number) => z.array(z.string().trim().min(1).max(max).refine(s => !/[<>]/.test(s))).min(1).max(5)
export const metaLaunchInput = client.extend({ publishedId: z.string().uuid(), exportId: z.string().uuid(), connectionId: z.string().uuid(), campaignId: id, adSetId: id, pageId: id,
  primaryTexts: texts(250), headlines: texts(40), descriptions: z.array(z.string().trim().min(1).max(30).refine(s => !/[<>]/.test(s))).max(5).default([]), callToAction: z.enum(['LEARN_MORE', 'SHOP_NOW', 'CONTACT_US', 'SIGN_UP', 'GET_QUOTE', 'DOWNLOAD', 'GET_OFFER', 'BOOK_NOW', 'APPLY_NOW', 'SUBSCRIBE', 'WATCH_MORE']), linkUrl: z.string().url().max(2048), adName: z.string().trim().min(1).max(160), status: z.literal('PAUSED').default('PAUSED') })
const proposal = client.extend({ proposalId: z.string().uuid() })
export const metaLaunchExact = proposal.extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), ack: z.literal(true) })
export const departmentMetaCampaignContracts = [
  ['marketing_get_meta_ad_launch', proposal, false, 'Read a scoped immutable paid Meta launch proposal and its retained receipts.'],
  ['marketing_prepare_meta_ad_launch', metaLaunchInput, true, 'Prepare a PAUSED Meta ad from a client-owned published banner and exact PNG/JPG export; binds account/campaign/ad set/page, copy and image bytes.'],
  ['marketing_approve_meta_ad_launch', metaLaunchExact, true, 'Independently approve this exact paid Meta ad revision after fresh ownership and asset checks.'],
  ['marketing_execute_meta_ad_launch', metaLaunchExact, true, 'Create only the independently approved exact PAUSED Meta ad once; partial/unknown outcomes remain held.']
] as const
export function assertDepartmentBannerAsset(value: string, key: string, projectId: string, publicBase: string): URL {
  const url = new URL(value)
  const base = new URL(publicBase)
  if (url.protocol !== 'https:' || base.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || url.search || url.hash
    || !key.startsWith(`banner-images/${projectId}/`) || !/\.(png|jpg|jpeg)$/.test(key) || key.includes('..')
    || decodeURIComponent(url.pathname) !== `${base.pathname.replace(/\/$/, '')}/${key}`) throw new Error('Scoped public image export required')
  return url
}
