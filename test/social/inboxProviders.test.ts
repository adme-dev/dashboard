import { afterEach, describe, it, expect, vi } from 'vitest'
import { mapYouTubeThreads } from '~~/server/utils/social-providers/youtube'
import {
  buildGoogleBusinessLocationResourceName,
  googleBusinessProvider,
  mapGoogleReviews
} from '~~/server/utils/social-providers/google-business'
import { facebookProvider, mapFacebookConversations, mapFacebookFeedComments, mapFacebookRatings } from '~~/server/utils/social-providers/facebook'
import { mapInstagramMediaComments } from '~~/server/utils/social-providers/instagram'
import { mapLinkedInComments } from '~~/server/utils/social-providers/linkedin'
import { mapTikTokComments } from '~~/server/utils/social-providers/tiktok'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mapYouTubeThreads', () => {
  it('maps commentThreads.list items to InboxItems', () => {
    const api = {
      items: [{
        snippet: {
          videoId: 'vid1',
          topLevelComment: {
            id: 'cmt1',
            snippet: {
              textDisplay: 'Loved it', authorDisplayName: 'Jane',
              authorChannelId: { value: 'uc_jane' }, publishedAt: '2026-06-01T00:00:00Z'
            }
          }
        }
      }],
      nextPageToken: 'PAGE2'
    }
    const { items, nextCursor } = mapYouTubeThreads(api)
    expect(nextCursor).toBe('PAGE2')
    expect(items[0]).toMatchObject({
      channelType: 'comment', platformConversationId: 'vid1', platformMessageId: 'cmt1',
      content: 'Loved it', authorName: 'Jane'
    })
  })
})

describe('mapGoogleReviews', () => {
  it('normalizes the stored composite account id into a GBP location resource name', () => {
    expect(buildGoogleBusinessLocationResourceName('acc1:loc1')).toBe('accounts/acc1/locations/loc1')
    expect(buildGoogleBusinessLocationResourceName('accounts/acc1/locations/loc1')).toBe('accounts/acc1/locations/loc1')
  })

  it('maps GBP reviews to InboxItems with numeric rating', () => {
    const api = { reviews: [{
      reviewId: 'r1', comment: 'Great service', starRating: 'FIVE',
      reviewer: { displayName: 'Sam', profilePhotoUrl: 'https://lh3.googleusercontent.com/sam.jpg' }, createTime: '2026-06-01T00:00:00Z',
      name: 'accounts/1/locations/2/reviews/r1'
    }], nextPageToken: 'NX' }
    const { items, nextCursor } = mapGoogleReviews(api)
    expect(nextCursor).toBe('NX')
    expect(items[0]).toMatchObject({
      channelType: 'review',
      platformMessageId: 'r1',
      rating: 5,
      content: 'Great service',
      metadata: { authorAvatarUrl: 'https://lh3.googleusercontent.com/sam.jpg' }
    })
  })

  it('maps GBP owner replies as outbound child messages under the review', () => {
    const api = { reviews: [{
      reviewId: 'r1',
      comment: 'Great service',
      starRating: 'FIVE',
      reviewer: { displayName: 'Sam' },
      createTime: '2026-06-01T00:00:00Z',
      name: 'accounts/1/locations/2/reviews/r1',
      reviewReply: {
        comment: 'Thanks Sam, appreciate the review.',
        updateTime: '2026-06-02T00:00:00Z'
      }
    }] }

    const { items } = mapGoogleReviews(api)

    expect(items).toHaveLength(2)
    expect(items[1]).toMatchObject({
      channelType: 'review',
      platformConversationId: 'accounts/1/locations/2/reviews/r1',
      platformMessageId: 'r1:reply',
      parentPlatformMessageId: 'r1',
      direction: 'out',
      messageType: 'review_reply',
      content: 'Thanks Sam, appreciate the review.',
      platformTimestamp: '2026-06-02T00:00:00Z'
    })
  })

  it('fetches reviews using the Google location resource path even when the account row stores a composite id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      reviews: [{
        reviewId: 'r1',
        comment: 'Great service',
        starRating: 'FIVE',
        reviewer: { displayName: 'Sam' },
        createTime: '2026-06-01T00:00:00Z',
        name: 'accounts/acc1/locations/loc1/reviews/r1'
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const result = await googleBusinessProvider.fetchInbox!({
      accountId: 'acc1:loc1',
      accessToken: 'AT',
      channelType: 'review'
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('https://mybusiness.googleapis.com/v4/accounts/acc1/locations/loc1/reviews?pageSize=50')
    expect(result.items[0]).toMatchObject({ platformMessageId: 'r1', rating: 5 })
  })
})

describe('mapFacebookRatings', () => {
  it('maps FB recommendations to InboxItems', () => {
    const api = { data: [{
      open_graph_story: { id: 'og1' }, recommendation_type: 'positive',
      review_text: 'Recommend!', reviewer: { name: 'Pat', id: 'p1' }, created_time: '2026-06-01T00:00:00Z'
    }], paging: { cursors: { after: 'AFTER' } } }
    const { items, nextCursor } = mapFacebookRatings(api)
    expect(nextCursor).toBe('AFTER')
    expect(items[0]).toMatchObject({ channelType: 'review', content: 'Recommend!', authorName: 'Pat', rating: 5 })
  })
})

describe('mapFacebookConversations', () => {
  const graphResponse = {
    data: [{
      id: 't_thread_1',
      link: '/327999007569038/inbox/psid_customer/?section=messages',
      updated_time: '2026-08-26T04:00:00+0000',
      participants: {
        data: [
          { id: '327999007569038', name: 'Blood Hyundai Geelong' },
          { id: 'psid_customer', name: 'Taylor Customer' }
        ]
      },
      messages: {
        data: [
          {
            id: 'mid_newest',
            created_time: '2026-08-26T04:00:00+0000',
            from: { id: '327999007569038', name: 'Blood Hyundai Geelong' },
            to: { data: [{ id: 'psid_customer', name: 'Taylor Customer' }] },
            message: 'We can book that for Friday.'
          },
          {
            id: 'mid_oldest',
            created_time: '2026-08-26T03:55:00+0000',
            from: { id: 'psid_customer', name: 'Taylor Customer' },
            to: { data: [{ id: '327999007569038', name: 'Blood Hyundai Geelong' }] },
            message: 'Can I book a test drive?'
          }
        ]
      }
    }],
    paging: { cursors: { after: 'NEXT_PAGE' } }
  }

  it('maps existing Messenger history to the same participant-keyed conversations as webhooks', () => {
    const result = mapFacebookConversations(graphResponse, { accountId: '327999007569038' })

    expect(result.nextCursor).toBe('NEXT_PAGE')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      channelType: 'dm',
      platformConversationId: 'psid_customer',
      platformMessageId: 'mid_oldest',
      direction: 'in',
      participant: { id: 'psid_customer', name: 'Taylor Customer' },
      content: 'Can I book a test drive?'
    })
    expect(result.items[1]).toMatchObject({
      platformConversationId: 'psid_customer',
      platformMessageId: 'mid_newest',
      direction: 'out',
      content: 'We can book that for Friday.'
    })
  })

  it('polls the Page conversations edge when the DM channel is requested', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(graphResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))

    const result = await facebookProvider.fetchInbox!({
      accountId: '327999007569038',
      accessToken: 'PAGE_TOKEN',
      channelType: 'dm',
      cursor: 'AFTER_THIS'
    })

    const url = new URL(String(fetchSpy.mock.calls[0]![0]))
    expect(url.pathname).toBe('/v25.0/327999007569038/conversations')
    expect(url.searchParams.get('after')).toBe('AFTER_THIS')
    expect(url.searchParams.get('access_token')).toBe('PAGE_TOKEN')
    expect(url.searchParams.get('fields')).toContain('messages')
    expect(result.items).toHaveLength(2)
  })

  it('includes the Meta error message when a conversation poll is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { message: '(#10) This endpoint requires the pages_messaging permission.' }
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    }))

    await expect(facebookProvider.fetchInbox!({
      accountId: '327999007569038',
      accessToken: 'PAGE_TOKEN',
      channelType: 'dm'
    })).rejects.toThrow('pages_messaging permission')
  })
})

describe('mapFacebookFeedComments', () => {
  it('maps page feed comments to InboxItems threaded by post id', () => {
    const api = {
      data: [{
        id: 'page_1_post_1',
        message: 'Monster Sale Weekend\nFriday 9am - 5pm',
        full_picture: 'https://cdn.example.com/facebook-post.jpg',
        permalink_url: 'https://facebook.com/page/posts/1',
        comments: {
          data: [{
            id: 'fb_comment_1',
            message: 'Is this still available?',
            from: { id: 'fb_user_1', name: 'Alex', picture: { data: { url: 'https://cdn.example.com/alex.jpg' } } },
            like_count: 3,
            comment_count: 1,
            created_time: '2026-06-28T01:02:03+0000',
            permalink_url: 'https://facebook.com/comment/1'
          }]
        }
      }],
      paging: { cursors: { after: 'POST_AFTER' } }
    }
    const { items, nextCursor } = mapFacebookFeedComments(api)
    expect(nextCursor).toBe('POST_AFTER')
    expect(items[0]).toMatchObject({
      channelType: 'comment',
      platformConversationId: 'page_1_post_1',
      platformMessageId: 'fb_comment_1',
      authorName: 'Alex',
      content: 'Is this still available?',
      permalink: 'https://facebook.com/comment/1',
      metadata: {
        sourcePost: {
          id: 'page_1_post_1',
          platform: 'facebook',
          title: 'Monster Sale Weekend',
          text: 'Monster Sale Weekend\nFriday 9am - 5pm',
          imageUrl: 'https://cdn.example.com/facebook-post.jpg',
          permalink: 'https://facebook.com/page/posts/1'
        },
        authorAvatarUrl: 'https://cdn.example.com/alex.jpg',
        likeCount: 3,
        replyCount: 1
      }
    })
  })

  it('uses the stored feed cursor to continue backfilling older post comments', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [],
      paging: { cursors: { after: 'OLDER_POSTS' } }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))

    const result = await facebookProvider.fetchInbox!({
      accountId: '327999007569038',
      accessToken: 'PAGE_TOKEN',
      channelType: 'comment',
      cursor: 'CURRENT_POST_PAGE'
    })

    const url = new URL(String(fetchSpy.mock.calls[0]![0]))
    expect(url.searchParams.get('after')).toBe('CURRENT_POST_PAGE')
    expect(result.nextCursor).toBe('OLDER_POSTS')
  })

  it('maps Facebook page replies as outbound child messages under the source comment', () => {
    const api = {
      data: [{
        id: 'page_1_post_1',
        permalink_url: 'https://facebook.com/page/posts/1',
        comments: {
          data: [{
            id: 'fb_comment_1',
            message: 'Is this still available?',
            from: { id: 'fb_user_1', name: 'Alex' },
            created_time: '2026-06-28T01:02:03+0000',
            comments: {
              data: [{
                id: 'fb_reply_1',
                message: 'Yes, it is still available.',
                from: { id: 'page_1', name: 'Northern Peugeot' },
                created_time: '2026-06-28T01:05:00+0000'
              }]
            }
          }]
        }
      }]
    }

    const { items } = mapFacebookFeedComments(api, { accountId: 'page_1' })

    expect(items).toHaveLength(2)
    expect(items[1]).toMatchObject({
      channelType: 'comment',
      platformConversationId: 'page_1_post_1',
      platformMessageId: 'fb_reply_1',
      parentPlatformMessageId: 'fb_comment_1',
      direction: 'out',
      authorName: 'Northern Peugeot',
      content: 'Yes, it is still available.'
    })
  })
})

describe('mapInstagramMediaComments', () => {
  it('maps media comments to InboxItems threaded by media id', () => {
    const api = {
      data: [{
        id: 'ig_media_1',
        permalink: 'https://instagram.com/p/abc',
        caption: 'New model arrival\nBook a test drive.',
        media_type: 'IMAGE',
        media_url: 'https://cdn.example.com/instagram-media.jpg',
        comments: {
          data: [{
            id: 'ig_comment_1',
            text: 'Love this',
            username: 'alex_insta',
            like_count: 4,
            timestamp: '2026-06-28T01:02:03+0000',
            replies: { data: [] }
          }]
        }
      }],
      paging: { cursors: { after: 'MEDIA_AFTER' } }
    }
    const { items, nextCursor } = mapInstagramMediaComments(api)
    expect(nextCursor).toBeNull()
    expect(items[0]).toMatchObject({
      channelType: 'comment',
      platformConversationId: 'ig_media_1',
      platformMessageId: 'ig_comment_1',
      participant: { name: 'alex_insta', handle: 'alex_insta' },
      authorName: 'alex_insta',
      content: 'Love this',
      permalink: 'https://instagram.com/p/abc',
      metadata: {
        sourcePost: {
          id: 'ig_media_1',
          platform: 'instagram',
          title: 'New model arrival',
          text: 'New model arrival\nBook a test drive.',
          imageUrl: 'https://cdn.example.com/instagram-media.jpg',
          mediaType: 'IMAGE',
          permalink: 'https://instagram.com/p/abc'
        },
        authorProfileUrl: 'https://www.instagram.com/alex_insta/',
        likeCount: 4,
        replyCount: 0
      }
    })
  })

  it('maps Instagram business replies as outbound child messages under the source comment', () => {
    const api = {
      data: [{
        id: 'ig_media_1',
        permalink: 'https://instagram.com/p/abc',
        comments: {
          data: [{
            id: 'ig_comment_1',
            text: 'Love this',
            username: 'alex_insta',
            timestamp: '2026-06-28T01:02:03+0000',
            replies: {
              data: [{
                id: 'ig_reply_1',
                text: 'Thanks Alex.',
                username: 'northernpeugeot',
                from: { id: 'ig_business_1', username: 'northernpeugeot' },
                timestamp: '2026-06-28T01:03:00+0000'
              }]
            }
          }]
        }
      }]
    }

    const { items } = mapInstagramMediaComments(api, { accountId: 'ig_business_1' })

    expect(items).toHaveLength(2)
    expect(items[1]).toMatchObject({
      channelType: 'comment',
      platformConversationId: 'ig_media_1',
      platformMessageId: 'ig_reply_1',
      parentPlatformMessageId: 'ig_comment_1',
      direction: 'out',
      authorName: 'northernpeugeot',
      content: 'Thanks Alex.'
    })
  })
})

describe('mapLinkedInComments', () => {
  it('maps org-share comments to InboxItems', () => {
    const api = {
      elements: [{
        id: 'urn:li:comment:(urn:li:share:123,456)',
        object: 'urn:li:share:123',
        message: { text: 'Nice post' },
        actor: 'urn:li:person:abc',
        created: { time: 1735689600000 }
      }],
      paging: { start: 0, count: 10, total: 1 }
    }
    const { items } = mapLinkedInComments(api)
    expect(items[0]).toMatchObject({ channelType: 'comment', content: 'Nice post', platformConversationId: 'urn:li:share:123' })
  })
})

describe('mapTikTokComments', () => {
  it('maps video comment list to InboxItems', () => {
    const api = { data: { comments: [{
      comment_id: 'tc1', video_id: 'tv1', text: 'cool', user: { display_name: 'Lee', open_id: 'o1' },
      create_time: 1735689600
    }], cursor: 10, has_more: true } }
    const { items, nextCursor } = mapTikTokComments(api)
    expect(items[0]).toMatchObject({ channelType: 'comment', platformMessageId: 'tc1', platformConversationId: 'tv1', content: 'cool' })
    expect(nextCursor).toBe('10')
  })
})
