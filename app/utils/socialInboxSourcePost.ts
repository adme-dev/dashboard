import type { SocialMessage } from '~/types'

export interface SocialInboxSourcePost {
  id?: string
  platform?: string
  title?: string
  text?: string
  imageUrl?: string
  thumbnailUrl?: string
  mediaType?: string
  permalink?: string
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text.length ? text : undefined
}

function normaliseSourcePost(value: unknown): SocialInboxSourcePost | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const post: SocialInboxSourcePost = {
    id: readString(record.id),
    platform: readString(record.platform),
    title: readString(record.title),
    text: readString(record.text),
    imageUrl: readString(record.imageUrl),
    thumbnailUrl: readString(record.thumbnailUrl),
    mediaType: readString(record.mediaType),
    permalink: readString(record.permalink)
  }
  return Object.values(post).some(Boolean) ? post : null
}

export function getSocialInboxSourcePost(messages: SocialMessage[]): SocialInboxSourcePost | null {
  for (const message of messages) {
    const post = normaliseSourcePost(message.metadata?.sourcePost)
    if (post) return post
  }
  return null
}

export function getSocialInboxSourcePostImage(post: SocialInboxSourcePost | null): string | null {
  return post?.imageUrl ?? post?.thumbnailUrl ?? null
}

export function getSocialInboxSourcePostTitle(post: SocialInboxSourcePost | null): string | null {
  if (!post) return null
  if (post.title) return post.title
  const firstLine = post.text?.split(/\r?\n/).map(line => line.trim()).find(Boolean)
  return firstLine ? firstLine.slice(0, 160) : null
}
