import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  linkedinProvider,
  encodeLinkedInUrn,
  linkedinCommentThreadUrn,
  LINKEDIN_INBOX_CALL_BUDGET,
  LINKEDIN_INBOX_COMMENT_PAGE_SIZE,
  LINKEDIN_INBOX_MAX_POSTS
} from '../../server/utils/social-providers/linkedin'
import { LINKEDIN_API_VERSION } from '../../server/utils/linkedinApiVersion'

// LinkedIn provider network layer: every call goes through providerFetch / providerFetchRaw.
const http = vi.hoisted(() => ({
  providerFetch: vi.fn(),
  providerFetchRaw: vi.fn()
}))
vi.mock('../../server/utils/social-providers/http', () => ({
  providerFetch: (...args: unknown[]) => http.providerFetch(...args),
  providerFetchRaw: (...args: unknown[]) => http.providerFetchRaw(...args),
  fetchWithTimeout: vi.fn()
}))

const API = 'https://api.linkedin.com'
const ORG = 'urn:li:organization:79988552'

function headers(extra: Record<string, string> = {}) {
  return {
    'Authorization': 'Bearer AT',
    'LinkedIn-Version': LINKEDIN_API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
    ...extra
  }
}

function raw(data: unknown, hdrs: Record<string, string> = {}) {
  return { headers: new Headers(hdrs), _data: data }
}

vi.spyOn(console, 'error').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})

beforeEach(() => {
  http.providerFetch.mockReset()
  http.providerFetchRaw.mockReset()
})

describe('linkedinProvider.post — organization authorship + x-restli-id', () => {
  it('authors as the organization and reads the post URN from the x-restli-id header', async () => {
    http.providerFetchRaw.mockResolvedValueOnce(raw(undefined, { 'x-restli-id': 'urn:li:share:7000' }))

    const result = await linkedinProvider.post({
      accountId: '79988552',
      accessToken: 'AT',
      content: 'Hello Page',
      options: { isOrganization: true }
    })

    expect(http.providerFetchRaw).toHaveBeenCalledWith(`${API}/rest/posts`, {
      method: 'POST',
      headers: headers(),
      body: {
        author: ORG,
        commentary: 'Hello Page',
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false
      }
    })
    expect(result).toEqual({
      platformPostId: 'urn:li:share:7000',
      url: 'https://www.linkedin.com/feed/update/urn:li:share:7000/',
      status: 'success'
    })
  })

  it('defaults to organization authorship when no options are passed', async () => {
    http.providerFetchRaw.mockResolvedValueOnce(raw(undefined, { 'x-restli-id': 'urn:li:share:1' }))
    await linkedinProvider.post({ accountId: '79988552', accessToken: 'AT', content: 'x' })
    expect((http.providerFetchRaw.mock.calls[0]![1] as { body: Record<string, unknown> }).body.author).toBe(ORG)
  })

  it('only authors as a member when isOrganization is explicitly false', async () => {
    http.providerFetchRaw.mockResolvedValueOnce(raw(undefined, { 'x-restli-id': 'urn:li:share:1' }))
    await linkedinProvider.post({ accountId: 'abc', accessToken: 'AT', content: 'x', options: { isOrganization: false } })
    expect((http.providerFetchRaw.mock.calls[0]![1] as { body: Record<string, unknown> }).body.author).toBe('urn:li:person:abc')
  })

  it('fails loudly when LinkedIn returns neither header nor body id', async () => {
    http.providerFetchRaw.mockResolvedValueOnce(raw(undefined))
    const result = await linkedinProvider.post({ accountId: '79988552', accessToken: 'AT', content: 'x' })
    expect(result.status).toBe('failed')
    expect(result.error).toContain('no post id')
  })
})

describe('linkedinProvider.post — images', () => {
  it('uploads as the org and posts single images with media.altText', async () => {
    const bytes = new ArrayBuffer(10)
    http.providerFetch.mockImplementation(async (url: string) => {
      if (url === `${API}/rest/images?action=initializeUpload`) {
        return { value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/IMG/0', image: 'urn:li:image:IMG' } }
      }
      if (url === 'https://r2.example/car.jpg') return bytes
      return undefined
    })
    http.providerFetchRaw.mockResolvedValueOnce(raw(undefined, { 'x-restli-id': 'urn:li:share:2' }))

    await linkedinProvider.post({
      accountId: '79988552',
      accessToken: 'AT',
      content: 'Car',
      media: [{ url: 'https://r2.example/car.jpg', type: 'image', alt: 'Red car' }],
      options: { isOrganization: true }
    })

    expect(http.providerFetch).toHaveBeenCalledWith(`${API}/rest/images?action=initializeUpload`, {
      method: 'POST',
      headers: headers(),
      body: { initializeUploadRequest: { owner: ORG } }
    })
    expect(http.providerFetch).toHaveBeenCalledWith('https://www.linkedin.com/dms-uploads/IMG/0', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer AT', 'Content-Type': 'application/octet-stream' },
      body: bytes
    })
    expect((http.providerFetchRaw.mock.calls[0]![1] as { body: Record<string, unknown> }).body.content).toEqual({
      media: { id: 'urn:li:image:IMG', altText: 'Red car' }
    })
  })

  it('keeps alt text aligned with the right image when one upload fails', async () => {
    let init = 0
    http.providerFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('initializeUpload')) {
        init++
        if (init === 1) throw new Error('boom')
        return { value: { uploadUrl: `https://up/${init}`, image: `urn:li:image:${init}` } }
      }
      return new ArrayBuffer(1)
    })
    http.providerFetchRaw.mockResolvedValueOnce(raw(undefined, { 'x-restli-id': 'urn:li:share:3' }))

    await linkedinProvider.post({
      accountId: '79988552',
      accessToken: 'AT',
      content: 'x',
      media: [
        { url: 'https://r2/a.jpg', type: 'image', alt: 'A' },
        { url: 'https://r2/b.jpg', type: 'image', alt: 'B' },
        { url: 'https://r2/c.jpg', type: 'image', alt: 'C' }
      ]
    })

    expect((http.providerFetchRaw.mock.calls[0]![1] as { body: Record<string, unknown> }).body.content).toEqual({
      multiImage: {
        images: [
          { id: 'urn:li:image:2', altText: 'B' },
          { id: 'urn:li:image:3', altText: 'C' }
        ]
      }
    })
  })
})

describe('linkedinProvider.post — multipart video upload', () => {
  it('declares the real size, uploads every part by byte range, and finalizes with ETags + uploadToken', async () => {
    const source = new Uint8Array(10).map((_, i) => i).buffer
    http.providerFetch.mockImplementation(async (url: string) => {
      if (url === 'https://r2.example/clip.mp4') return source
      if (url === `${API}/rest/videos?action=initializeUpload`) {
        return {
          value: {
            video: 'urn:li:video:V1',
            uploadToken: 'TOKEN',
            uploadInstructions: [
              { uploadUrl: 'https://www.linkedin.com/dms-uploads/V1/part0', firstByte: 0, lastByte: 3 },
              { uploadUrl: 'https://www.linkedin.com/dms-uploads/V1/part1', firstByte: 4, lastByte: 7 },
              { uploadUrl: 'https://www.linkedin.com/dms-uploads/V1/part2', firstByte: 8, lastByte: 9 }
            ]
          }
        }
      }
      return undefined
    })
    http.providerFetchRaw.mockImplementation(async (url: string) => {
      const part = url.match(/part(\d)$/)?.[1]
      if (part) return raw(undefined, { etag: `/ambry-video/signedId/etag-${part}.bin` })
      return raw(undefined, { 'x-restli-id': 'urn:li:ugcPost:9' })
    })

    const result = await linkedinProvider.post({
      accountId: '79988552',
      accessToken: 'AT',
      content: 'Video',
      media: [{ url: 'https://r2.example/clip.mp4', type: 'video' }]
    })

    expect(http.providerFetch).toHaveBeenCalledWith(`${API}/rest/videos?action=initializeUpload`, {
      method: 'POST',
      headers: headers(),
      body: { initializeUploadRequest: { owner: ORG, fileSizeBytes: 10, uploadCaptions: false, uploadThumbnail: false } }
    })

    const partCalls = http.providerFetchRaw.mock.calls.filter(([url]) => String(url).includes('/part'))
    expect(partCalls.map(([url]) => url)).toEqual([
      'https://www.linkedin.com/dms-uploads/V1/part0',
      'https://www.linkedin.com/dms-uploads/V1/part1',
      'https://www.linkedin.com/dms-uploads/V1/part2'
    ])
    expect(partCalls.map(([, opts]) => Array.from(new Uint8Array((opts as { body: ArrayBuffer }).body)))).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9]
    ])
    expect((partCalls[0]![1] as { method: string }).method).toBe('PUT')

    expect(http.providerFetch).toHaveBeenCalledWith(`${API}/rest/videos?action=finalizeUpload`, {
      method: 'POST',
      headers: headers(),
      body: {
        finalizeUploadRequest: {
          video: 'urn:li:video:V1',
          uploadToken: 'TOKEN',
          uploadedPartIds: [
            '/ambry-video/signedId/etag-0.bin',
            '/ambry-video/signedId/etag-1.bin',
            '/ambry-video/signedId/etag-2.bin'
          ]
        }
      }
    })
    expect(result).toMatchObject({ status: 'success', platformPostId: 'urn:li:ugcPost:9' })
    const postCall = http.providerFetchRaw.mock.calls.find(([url]) => url === `${API}/rest/posts`)!
    expect((postCall[1] as { body: Record<string, unknown> }).body.content).toEqual({ media: { title: 'Video', id: 'urn:li:video:V1' } })
  })

  it('fails without finalizing when a part returns no ETag', async () => {
    http.providerFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('.mp4')) return new ArrayBuffer(4)
      if (url.endsWith('initializeUpload')) {
        return { value: { video: 'urn:li:video:V', uploadToken: '', uploadInstructions: [{ uploadUrl: 'https://up/p', firstByte: 0, lastByte: 3 }] } }
      }
      return undefined
    })
    http.providerFetchRaw.mockResolvedValue(raw(undefined))

    const result = await linkedinProvider.post({
      accountId: '1', accessToken: 'AT', content: '', media: [{ url: 'https://r2/x.mp4', type: 'video' }]
    })
    expect(result.status).toBe('failed')
    expect(result.error).toContain('no ETag')
    expect(http.providerFetch.mock.calls.some(([url]) => String(url).includes('finalizeUpload'))).toBe(false)
  })
})

describe('linkedinProvider comments + replies', () => {
  it('posts the first comment as the organization on the versioned socialActions endpoint', async () => {
    http.providerFetchRaw.mockResolvedValueOnce(raw(
      { id: '6643', commentUrn: 'urn:li:comment:(urn:li:activity:1,6643)' },
      { 'x-restli-id': '6643' }
    ))

    const result = await linkedinProvider.comment!({
      accountId: '79988552',
      accessToken: 'AT',
      postId: 'urn:li:share:7000',
      content: 'First!',
      options: { isOrganization: true }
    })

    expect(http.providerFetchRaw).toHaveBeenCalledWith(
      `${API}/rest/socialActions/urn%3Ali%3Ashare%3A7000/comments`,
      {
        method: 'POST',
        headers: headers(),
        body: { actor: ORG, object: 'urn:li:share:7000', message: { text: 'First!' } }
      }
    )
    expect(result).toEqual({ platformPostId: 'urn:li:comment:(urn:li:activity:1,6643)', url: '', status: 'success' })
  })

  it('replies to an inbound comment as a nested comment from the organization', async () => {
    http.providerFetchRaw.mockResolvedValueOnce(raw({ commentUrn: 'urn:li:comment:(urn:li:activity:55,99)' }))
    const target = 'urn:li:comment:(urn:li:activity:55,42)'

    const result = await linkedinProvider.reply!({
      accountId: '79988552', accessToken: 'AT', conversationId: target, content: 'Thanks!'
    })

    expect(http.providerFetchRaw).toHaveBeenCalledWith(
      `${API}/rest/socialActions/urn%3Ali%3Acomment%3A%28urn%3Ali%3Aactivity%3A55%2C42%29/comments`,
      {
        method: 'POST',
        headers: headers(),
        body: {
          actor: ORG,
          object: 'urn:li:activity:55',
          message: { text: 'Thanks!' },
          parentComment: target
        }
      }
    )
    expect(result).toEqual({ platformMessageId: 'urn:li:comment:(urn:li:activity:55,99)', status: 'success' })
  })

  it('replies to a nested reply under its top-level parent (LinkedIn nests one level)', async () => {
    http.providerFetchRaw.mockResolvedValueOnce(raw({ commentUrn: 'urn:li:comment:(urn:li:activity:55,100)' }))
    const parent = 'urn:li:comment:(urn:li:activity:55,42)'

    await linkedinProvider.reply!({
      accountId: '79988552',
      accessToken: 'AT',
      conversationId: 'urn:li:comment:(urn:li:activity:55,77)',
      threadParentId: parent,
      content: 'Following up'
    })

    expect(http.providerFetchRaw).toHaveBeenCalledWith(
      `${API}/rest/socialActions/${encodeLinkedInUrn(parent)}/comments`,
      expect.objectContaining({ body: expect.objectContaining({ actor: ORG, object: 'urn:li:activity:55', parentComment: parent }) })
    )
  })

  it('surfaces reply failures instead of throwing', async () => {
    http.providerFetchRaw.mockRejectedValueOnce(Object.assign(new Error('nope'), { statusCode: 403 }))
    const result = await linkedinProvider.reply!({ accountId: '1', accessToken: 'AT', conversationId: 'urn:li:share:1', content: 'x' })
    expect(result.status).toBe('failed')
    expect(result.error).toContain('permissions')
  })

  it('encodes Rest.li structural characters in composite URNs', () => {
    expect(encodeLinkedInUrn('urn:li:comment:(urn:li:activity:1,2)')).toBe('urn%3Ali%3Acomment%3A%28urn%3Ali%3Aactivity%3A1%2C2%29')
    expect(linkedinCommentThreadUrn('urn:li:comment:(urn:li:ugcPost:7,8)')).toBe('urn:li:ugcPost:7')
    expect(linkedinCommentThreadUrn('urn:li:share:7')).toBeNull()
  })
})

interface FakeComment {
  id: string
  commentUrn: string
  actor: string
  object: string
  message: { text: string }
  created: { time: number }
  parentComment?: string
}

/** In-memory LinkedIn: posts finder, socialMetadata batch, and paged socialActions comments. */
function fakeLinkedIn() {
  const threads = new Map<string, FakeComment[]>() // post URN or comment URN → comments under it
  const postUrns: string[] = []
  let nextId = 1
  const calls: string[] = []

  function add(target: string, actor: string, time: number, text = `t${nextId}`): FakeComment {
    const id = String(nextId++)
    const parent = target.startsWith('urn:li:comment:') ? target : undefined
    const activity = parent ? target.match(/^urn:li:comment:\((.+),[^,]+\)$/)![1]! : `urn:li:activity:${target.split(':').pop()}`
    const comment: FakeComment = {
      id, commentUrn: `urn:li:comment:(${activity},${id})`, actor, object: activity,
      message: { text }, created: { time }, ...(parent ? { parentComment: parent } : {})
    }
    threads.set(target, [...(threads.get(target) ?? []), comment])
    return comment
  }
  function totalUnder(urn: string): number {
    return (threads.get(urn) ?? []).reduce((sum, c) => sum + 1 + totalUnder(c.commentUrn), 0)
  }

  http.providerFetch.mockImplementation(async (url: string) => {
    calls.push(url)
    if (url.startsWith(`${API}/rest/posts?`)) return { elements: postUrns.map(id => ({ id })) }
    if (url.startsWith(`${API}/rest/socialMetadata?ids=List(`)) {
      const ids = url.slice(url.indexOf('List(') + 5, -1).split(',').map(decodeURIComponent)
      return { results: Object.fromEntries(ids.map(id => [id, {
        entity: id,
        commentSummary: { count: id.startsWith('urn:li:comment:') ? (threads.get(id) ?? []).length : totalUnder(id) }
      }])) }
    }
    const match = url.match(/\/rest\/socialActions\/([^/]+)\/comments\?start=(\d+)&count=(\d+)$/)
    if (match) {
      const all = threads.get(decodeURIComponent(match[1]!)) ?? []
      const start = Number(match[2])
      const count = Number(match[3])
      return {
        elements: all.slice(start, start + count),
        paging: { start, count, links: start + count < all.length ? [{ rel: 'next' }] : [] }
      }
    }
    throw new Error(`unexpected ${url}`)
  })

  return { threads, postUrns, add, calls }
}

async function poll(cursor: string | null) {
  return linkedinProvider.fetchInbox!({ accountId: '79988552', accessToken: 'AT', cursor })
}

describe('linkedinProvider.fetchInbox — resumable traversal', () => {
  it('lists recent org posts with the FINDER header and encodes comment paths', async () => {
    const li = fakeLinkedIn()
    li.postUrns.push('urn:li:share:A')
    li.add('urn:li:share:A', 'urn:li:person:p1', 1000)

    const result = await poll(null)

    expect(http.providerFetch).toHaveBeenCalledWith(
      `${API}/rest/posts?author=urn%3Ali%3Aorganization%3A79988552&q=author&count=${LINKEDIN_INBOX_MAX_POSTS}&sortBy=LAST_MODIFIED`,
      { headers: headers({ 'X-RestLi-Method': 'FINDER' }) }
    )
    expect(http.providerFetch).toHaveBeenCalledWith(
      `${API}/rest/socialActions/urn%3Ali%3Ashare%3AA/comments?start=0&count=${LINKEDIN_INBOX_COMMENT_PAGE_SIZE}`,
      { headers: headers() }
    )
    expect(result.items[0]).toMatchObject({
      channelType: 'comment',
      platformConversationId: 'urn:li:share:A',
      platformMessageId: 'urn:li:comment:(urn:li:activity:A,1)',
      permalink: 'https://www.linkedin.com/feed/update/urn:li:share:A/',
      authorId: 'urn:li:person:p1',
      platformTimestamp: new Date(1000).toISOString()
    })
  })

  it('ingests all 101 comments on a busy post, then only the new one, then skips the unchanged post', async () => {
    const li = fakeLinkedIn()
    li.postUrns.push('urn:li:share:A')
    for (let i = 1; i <= 101; i++) li.add('urn:li:share:A', `urn:li:person:p${i}`, i * 1000)

    const first = await poll(null)
    expect(new Set(first.items.map(i => i.platformMessageId)).size).toBe(101)
    expect(first.items.at(-1)?.platformTimestamp).toBe(new Date(101_000).toISOString())

    const latest = li.add('urn:li:share:A', 'urn:li:person:late', 102_000)
    const second = await poll(first.nextCursor!)
    expect(second.items.map(i => i.platformMessageId)).toEqual([latest.commentUrn])

    li.calls.length = 0
    const third = await poll(second.nextCursor!)
    expect(third.items).toEqual([])
    // posts finder + one socialMetadata batch; the unchanged post is not re-paged.
    expect(li.calls).toHaveLength(2)
  })

  it('resumes from the saved offset when the call budget runs out, without advancing the high-water mark early', async () => {
    const li = fakeLinkedIn()
    li.postUrns.push('urn:li:share:BIG')
    for (let i = 1; i <= 400; i++) li.add('urn:li:share:BIG', 'urn:li:person:p', i)

    const seen = new Set<string>()
    let cursor: string | null = null
    let runs = 0
    for (; runs < 5; runs++) {
      const result = await poll(cursor)
      result.items.forEach(item => seen.add(item.platformMessageId))
      const state = JSON.parse(result.nextCursor!).posts['urn:li:share:BIG']
      cursor = result.nextCursor!
      if (runs === 0) {
        expect(http.providerFetch.mock.calls.length).toBeLessThanOrEqual(LINKEDIN_INBOX_CALL_BUDGET)
        expect(state.start).toBeGreaterThan(0)
        expect(state.hw).toBeUndefined()
      }
      if (state.start === undefined) break
      http.providerFetch.mockClear()
    }
    expect(runs).toBeGreaterThan(0)
    expect(seen.size).toBe(400)
    expect(JSON.parse(cursor!).posts['urn:li:share:BIG'].hw).toBe(400)
  })

  it('fetches nested replies (including under the Page\'s own comment) with thread linkage, skipping Page replies', async () => {
    const li = fakeLinkedIn()
    li.postUrns.push('urn:li:share:A')
    const customer = li.add('urn:li:share:A', 'urn:li:person:cust', 1000, 'Price?')
    const pageComment = li.add('urn:li:share:A', ORG, 2000, 'First comment from the Page')
    const ourReply = li.add(customer.commentUrn, ORG, 3000, 'DM us')
    const followUp = li.add(customer.commentUrn, 'urn:li:person:cust', 4000, 'Done, thanks')
    const underPage = li.add(pageComment.commentUrn, 'urn:li:person:other', 5000, 'Nice')

    const first = await poll(null)
    const ids = first.items.map(i => i.platformMessageId)
    expect(ids).toContain(customer.commentUrn)
    expect(ids).toContain(followUp.commentUrn)
    expect(ids).toContain(underPage.commentUrn)
    expect(ids).not.toContain(ourReply.commentUrn)
    expect(ids).not.toContain(pageComment.commentUrn)
    expect(http.providerFetch).toHaveBeenCalledWith(
      `${API}/rest/socialActions/${encodeLinkedInUrn(customer.commentUrn)}/comments?start=0&count=${LINKEDIN_INBOX_COMMENT_PAGE_SIZE}`,
      { headers: headers() }
    )
    expect(first.items.find(i => i.platformMessageId === followUp.commentUrn)).toMatchObject({
      platformConversationId: 'urn:li:share:A',
      parentPlatformMessageId: customer.commentUrn,
      content: 'Done, thanks'
    })

    // A later follow-up deep in an old thread still arrives; the old top-level comment is not re-sent.
    const later = li.add(customer.commentUrn, 'urn:li:person:cust', 9000, 'One more question')
    const second = await poll(first.nextCursor!)
    const secondIds = second.items.map(i => i.platformMessageId)
    expect(secondIds).toContain(later.commentUrn)
    expect(secondIds).not.toContain(customer.commentUrn)
  })

  it('uses commentsSummary when present instead of a socialMetadata lookup for replies', async () => {
    http.providerFetch.mockImplementation(async (url: string) => {
      if (url.startsWith(`${API}/rest/posts?`)) return { elements: [{ id: 'urn:li:share:A' }] }
      if (url.startsWith(`${API}/rest/socialMetadata`)) return { results: { 'urn:li:share:A': { commentSummary: { count: 1 } } } }
      return { elements: [{ id: '1', commentUrn: 'urn:li:comment:(urn:li:activity:A,1)', actor: 'urn:li:person:p', object: 'urn:li:activity:A', created: { time: 1 }, commentsSummary: { aggregatedTotalComments: 0 } }] }
    })
    await poll(null)
    expect(http.providerFetch.mock.calls.filter(([url]) => String(url).includes('socialMetadata'))).toHaveLength(1)
  })
})

describe('linkedinProvider analytics', () => {
  it('fetches lifetime share statistics for share + ugcPost URNs and zero-fills omitted posts', async () => {
    http.providerFetch.mockResolvedValueOnce({
      elements: [{
        organizationalEntity: ORG,
        share: 'urn:li:share:1',
        totalShareStatistics: { impressionCount: 100, uniqueImpressionsCount: 80, clickCount: 5, likeCount: 4, commentCount: 3, shareCount: 2 }
      }]
    })

    const metrics = await linkedinProvider.fetchPostMetrics!({
      accountId: '79988552',
      accessToken: 'AT',
      posts: [
        { postId: 'P1', platformPostId: 'urn:li:share:1' },
        { postId: 'P2', platformPostId: 'urn:li:ugcPost:2' },
        { postId: 'P3', platformPostId: 'not-a-urn' }
      ]
    })

    expect(http.providerFetch).toHaveBeenCalledWith(
      `${API}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn%3Ali%3Aorganization%3A79988552&shares=List(urn%3Ali%3Ashare%3A1)&ugcPosts=List(urn%3Ali%3AugcPost%3A2)`,
      { headers: headers() }
    )
    expect(metrics).toEqual([
      { postId: 'P1', platformPostId: 'urn:li:share:1', impressions: 100, reach: 80, clicks: 5, likes: 4, reactions: 4, commentsCount: 3, shares: 2, engagements: 14 },
      { postId: 'P2', platformPostId: 'urn:li:ugcPost:2', impressions: 0, reach: 0, clicks: 0, likes: 0, reactions: 0, commentsCount: 0, shares: 0, engagements: 0 }
    ])
  })

  it('reads followers from networkSizes and lifetime org impressions from share statistics', async () => {
    http.providerFetch.mockImplementation(async (url: string) => {
      if (url.includes('/rest/networkSizes/')) return { firstDegreeSize: 1234 }
      return { elements: [{ totalShareStatistics: { impressionCount: 9000, uniqueImpressionsCount: 7000 } }] }
    })

    const metric = await linkedinProvider.fetchAccountMetrics!({ accountId: '79988552', accessToken: 'AT' })

    expect(http.providerFetch).toHaveBeenCalledWith(
      `${API}/rest/networkSizes/urn%3Ali%3Aorganization%3A79988552?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
      { headers: headers() }
    )
    expect(http.providerFetch).toHaveBeenCalledWith(
      `${API}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn%3Ali%3Aorganization%3A79988552`,
      { headers: headers() }
    )
    expect(metric).toEqual({ followers: 1234, impressions: 9000, reach: 7000 })
  })

  it('leaves impressions/reach unset and reports a partial failure when share statistics 503', async () => {
    http.providerFetch.mockImplementation(async (url: string) => {
      if (url.includes('/rest/networkSizes/')) return { firstDegreeSize: 5 }
      throw Object.assign(new Error('Service Unavailable'), { statusCode: 503 })
    })
    const metric = await linkedinProvider.fetchAccountMetrics!({ accountId: '1', accessToken: 'AT' })
    expect(metric).toEqual({ followers: 5, partialFailures: ['share statistics unavailable: Service Unavailable'] })
    expect(metric.impressions).toBeUndefined()
    expect(metric.reach).toBeUndefined()
  })
})
