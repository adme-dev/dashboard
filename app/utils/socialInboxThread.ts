import type { SocialMessage } from '~/types'

export interface SocialInboxThreadItem {
  message: SocialMessage
  replies: SocialMessage[]
}

export function groupSocialInboxMessages(messages: SocialMessage[]): SocialInboxThreadItem[] {
  const byId = new Map(messages.map(message => [message.id, message]))
  const groups = new Map<string, SocialInboxThreadItem>()
  const roots: SocialInboxThreadItem[] = []

  for (const message of messages) {
    groups.set(message.id, { message, replies: [] })
  }

  for (const message of messages) {
    const parentId = message.parent_message_id
    const parentGroup = parentId ? groups.get(parentId) : null

    if (parentId && parentGroup && byId.has(parentId)) {
      parentGroup.replies.push(message)
      continue
    }

    const group = groups.get(message.id)
    if (group) roots.push(group)
  }

  return roots
}
