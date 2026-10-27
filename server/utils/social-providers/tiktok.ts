/** TikTok Direct Post: init acceptance is never a publication receipt. */
import type { SocialPostProvider, PostParams, PostResult, FetchInboxParams, FetchInboxResult, ReplyParams, ReplyResult } from './types'
import type { InboxItem } from '~~/server/utils/socialInbox/types'
import { providerFetch, isAmbiguousHttpOutcome } from './http'
import { tikTokPayloadError, type TikTokCreatorCapabilities } from '~~/shared/tiktokPosting'
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'
type TikTokResponse = { data?: Record<string, any>, error?: { code?: string, log_id?: string } }
export function tikTokReceipt(response: TikTokResponse) {
  const safe = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null
  return { code: safe(response.error?.code), logId: safe(response.error?.log_id) }
}
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' })
export const usableTikTokPublishId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64 && !/[\s\x00-\x1f\x7f]/.test(id)
export async function queryTikTokCreatorPostCapabilities(accessToken: string): Promise<TikTokCreatorCapabilities> {
  const response = await providerFetch<TikTokResponse>(`${TIKTOK_API_BASE}/post/publish/creator_info/query/`, { method: 'POST', headers: headers(accessToken), body: {}, retry: 0, timeout: 12000 })
  const d = response.data
  if (response.error?.code !== 'ok' || !d || !Array.isArray(d.privacy_level_options)
    || !d.privacy_level_options.every((v: unknown) => typeof v === 'string')
    || !['comment_disabled', 'duet_disabled', 'stitch_disabled'].every(k => typeof d[k] === 'boolean')
    || !Number.isFinite(d.max_video_post_duration_sec) || d.max_video_post_duration_sec <= 0) {
    throw new Error(`TikTok creator unavailable: ${tikTokReceipt(response).code ?? 'invalid_response'}`)
  }
  return { creator_nickname: String(d.creator_nickname ?? ''), creator_username: String(d.creator_username ?? ''),
    creator_avatar_url: typeof d.creator_avatar_url === 'string' ? d.creator_avatar_url : undefined,
    privacy_level_options: d.privacy_level_options, comment_disabled: d.comment_disabled, duet_disabled: d.duet_disabled,
    stitch_disabled: d.stitch_disabled, max_video_post_duration_sec: d.max_video_post_duration_sec }
}
export interface TikTokStatusResult {
  state: 'accepted' | 'published' | 'failed' | 'unknown'
  providerStatus: string
  providerReceipt: ReturnType<typeof tikTokReceipt>
  publicPostIds?: string[]
  error?: string
}
export async function fetchTikTokPublishStatus(accessToken: string, publishId: string): Promise<TikTokStatusResult> {
  if (!usableTikTokPublishId(publishId)) return { state: 'unknown', providerStatus: 'invalid_publish_id', providerReceipt: { code: null, logId: null } }
  try {
    const r = await providerFetch<TikTokResponse>(`${TIKTOK_API_BASE}/post/publish/status/fetch/`, { method: 'POST', headers: headers(accessToken), body: { publish_id: publishId }, retry: 0, timeout: 12000 })
    const receipt = tikTokReceipt(r)
    if (r.error?.code !== 'ok') return { state: ['invalid_publish_id', 'token_not_authorized_for_specified_publish_id'].includes(receipt.code ?? '') ? 'unknown' : 'accepted', providerStatus: 'lookup_error', providerReceipt: receipt }
    const status = typeof r.data?.status === 'string' && /^[A-Z_]{1,64}$/.test(r.data.status) ? r.data.status : 'INVALID_STATUS'
    const state = status === 'PUBLISH_COMPLETE' ? 'published' : status === 'FAILED' ? 'failed' : ['PROCESSING_DOWNLOAD', 'PROCESSING_UPLOAD'].includes(status) ? 'accepted' : 'unknown'
    return { state, providerStatus: status, providerReceipt: receipt,
      publicPostIds: Array.isArray(r.data?.publicaly_available_post_id) ? r.data.publicaly_available_post_id.map((id: unknown) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? String(id) : id).filter((id: unknown): id is string => typeof id === 'string' && /^\d{1,64}$/.test(id)).slice(0, 35) : [],
      ...(state === 'failed' ? { error: typeof r.data?.fail_reason === 'string' && /^[a-z_]{1,80}$/.test(r.data.fail_reason) ? r.data.fail_reason : 'provider_failed' } : {}) }
  } catch (error: any) {
    const receipt = tikTokReceipt(error?.data ?? {})
    return { state: ['invalid_publish_id', 'token_not_authorized_for_specified_publish_id'].includes(receipt.code ?? '') ? 'unknown' : 'accepted', providerStatus: 'lookup_unavailable', providerReceipt: receipt }
  }
}
export const tiktokProvider: SocialPostProvider = {
  identifier: 'tiktok', name: 'TikTok',
  async post(params: PostParams): Promise<PostResult> {
    const fail = (error: string, indeterminate = false): PostResult => ({ status: 'failed', platformPostId: '', url: '', error, indeterminate })
    const media = params.media ?? []
    const options = params.options ?? {}
    const mapped = media.map(m => ({ mediaType: m.type, durationSeconds: m.durationSeconds }))
    const problem = tikTokPayloadError(params.content, mapped, options)
    if (problem) return fail(problem)
    if (media.some(m => { try { return new URL(m.url).protocol !== 'https:' } catch { return true } })) return fail('TikTok media requires HTTPS')
    try {
      const creator = await queryTikTokCreatorPostCapabilities(params.accessToken)
      const error = tikTokPayloadError(params.content, mapped, options, creator)
      if (error) return fail(error)
    } catch { return fail('TikTok creator capabilities are unavailable; nothing was submitted') }
    const video = media[0]!.type === 'video'
    const common = { privacy_level: options.privacy_level, disable_comment: options.disable_comment !== false,
      brand_content_toggle: options.brand_content_toggle === true, brand_organic_toggle: options.brand_organic_toggle === true }
    const body = video ? {
      post_info: { ...common, title: params.content, disable_duet: options.disable_duet !== false, disable_stitch: options.disable_stitch !== false,
        video_cover_timestamp_ms: options.video_cover_timestamp_ms ?? 0, is_aigc: options.is_aigc === true },
      source_info: { source: 'PULL_FROM_URL', video_url: media[0]!.url }
    } : {
      post_info: { ...common, title: options.title ?? '', description: params.content, auto_add_music: options.auto_add_music === true },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: options.photo_cover_index ?? 0, photo_images: media.map(m => m.url) },
      post_mode: 'DIRECT_POST', media_type: 'PHOTO', is_aigc: options.is_aigc === true
    }
    try {
      const r = await providerFetch<TikTokResponse>(`${TIKTOK_API_BASE}/post/publish/${video ? 'video' : 'content'}/init/`, { method: 'POST', headers: headers(params.accessToken), body, retry: 0, timeout: 12000 })
      const providerReceipt = tikTokReceipt(r)
      if (r.error?.code && r.error.code !== 'ok') return { ...fail(`TikTok rejected init: ${providerReceipt.code ?? 'rejected'}`), providerReceipt }
      if (r.error?.code !== 'ok' || !usableTikTokPublishId(r.data?.publish_id)) return { ...fail('TikTok init outcome unknown; do not retry', true), providerReceipt }
      return { status: 'accepted', platformPostId: r.data!.publish_id, url: '', providerStatus: 'INIT_ACCEPTED', providerReceipt }
    } catch (error: any) {
      return fail('TikTok init request did not return a usable receipt', isAmbiguousHttpOutcome(error?.statusCode ?? error?.status))
    }
  }
}

// --- Slice 2 inbox: TikTok video comments (best-effort) ---
/** Pure: map a TikTok comment/list response to InboxItems + next cursor. */
export function mapTikTokComments(api: any): FetchInboxResult {
  const d = api?.data ?? {}
  const items: InboxItem[] = (d.comments ?? []).map((c: any) => ({
    channelType: 'comment' as const,
    platformConversationId: String(c.video_id ?? ''),
    participant: { id: c.user?.open_id, name: c.user?.display_name },
    platformMessageId: String(c.comment_id ?? ''),
    authorId: c.user?.open_id,
    authorName: c.user?.display_name,
    content: c.text ?? '',
    messageType: 'comment',
    platformTimestamp: c.create_time ? new Date(c.create_time * 1000).toISOString() : undefined,
  }))
  return { items, nextCursor: d.has_more ? String(d.cursor ?? '') : null }
}

tiktokProvider.fetchInbox = async ({ accessToken, cursor }: FetchInboxParams): Promise<FetchInboxResult> => {
  // Best-effort: TikTok comment list requires a video_id (passed via cursor as `${videoId}:${pageCursor}`).
  if (!cursor) return { items: [], nextCursor: null }
  const [videoId, page] = cursor.split(':')
  const res = await fetch(`${TIKTOK_API_BASE}/video/comment/list/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: videoId, max_count: 50, cursor: page ? Number(page) : 0 }),
  })
  if (!res.ok) throw new Error(`tiktok fetchInbox ${res.status}`)
  return mapTikTokComments(await res.json())
}

tiktokProvider.reply = async ({ accessToken, conversationId, content }: ReplyParams): Promise<ReplyResult> => {
  // TikTok comment reply requires the comment.reply scope, which may be unavailable. Degrade gracefully.
  try {
    const res = await fetch(`${TIKTOK_API_BASE}/video/comment/reply/create/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: conversationId, text: content }),
    })
    const j: any = await res.json().catch(() => ({}))
    return res.ok && !j?.error?.code
      ? { platformMessageId: String(j?.data?.comment_id ?? ''), status: 'success' }
      : { platformMessageId: '', status: 'failed', error: j?.error?.message ?? `http ${res.status}` }
  } catch (e: any) {
    return { platformMessageId: '', status: 'failed', error: e?.message ?? 'tiktok reply failed' }
  }
}
