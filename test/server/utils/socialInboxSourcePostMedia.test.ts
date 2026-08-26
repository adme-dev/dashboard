import { describe, expect, it, vi } from 'vitest'
import {
  fetchMetaSourcePostImage,
  isAllowedMetaImageUrl
} from '~~/server/utils/socialInbox/sourcePostMedia'

describe('social inbox source post media', () => {
  it('refreshes a Facebook post image through Graph before downloading it', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        full_picture: 'https://scontent-syd2-1.xx.fbcdn.net/fresh/post.jpg'
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': '3' }
      }))

    const image = await fetchMetaSourcePostImage({
      platform: 'facebook',
      sourcePostId: 'page_post',
      accessToken: 'page-token',
      fetcher
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
    const graphUrl = new URL(String(fetcher.mock.calls[0]?.[0]))
    expect(graphUrl.origin).toBe('https://graph.facebook.com')
    expect(graphUrl.pathname).toContain('/page_post')
    expect(graphUrl.searchParams.get('access_token')).toBe('page-token')
    expect(String(fetcher.mock.calls[1]?.[0])).toBe('https://scontent-syd2-1.xx.fbcdn.net/fresh/post.jpg')
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ redirect: 'error' })
    expect(image?.contentType).toBe('image/jpeg')
    expect(Array.from(new Uint8Array(image?.body ?? new ArrayBuffer(0)))).toEqual([1, 2, 3])
  })

  it('allows Meta image CDNs and rejects unrelated hosts', () => {
    expect(isAllowedMetaImageUrl('https://scontent-syd2-1.xx.fbcdn.net/photo.jpg')).toBe(true)
    expect(isAllowedMetaImageUrl('https://scontent.cdninstagram.com/photo.jpg')).toBe(true)
    expect(isAllowedMetaImageUrl('https://example.com/photo.jpg')).toBe(false)
    expect(isAllowedMetaImageUrl('http://scontent.xx.fbcdn.net/photo.jpg')).toBe(false)
  })

  it('does not download a URL from an untrusted Graph response', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      full_picture: 'https://example.com/not-meta.jpg'
    }), { status: 200 }))

    const image = await fetchMetaSourcePostImage({
      platform: 'facebook',
      sourcePostId: 'page_post',
      accessToken: 'page-token',
      fetcher
    })

    expect(image).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects non-image responses from the refreshed CDN URL', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        media_url: 'https://scontent.cdninstagram.com/post.jpg'
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('denied', {
        status: 200,
        headers: { 'content-type': 'text/plain' }
      }))

    await expect(fetchMetaSourcePostImage({
      platform: 'instagram',
      sourcePostId: 'media-1',
      accessToken: 'ig-token',
      fetcher
    })).resolves.toBeNull()
  })

  it('rejects active SVG content even when the response claims to be an image', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        full_picture: 'https://scontent.xx.fbcdn.net/post.svg'
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('<svg/>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' }
      }))

    await expect(fetchMetaSourcePostImage({
      platform: 'facebook',
      sourcePostId: 'page_post',
      accessToken: 'page-token',
      fetcher
    })).resolves.toBeNull()
  })
})
