// Dependency-free (zod only): imported by policy/projection without loading executable services.
import { z } from 'zod'

export const DEPARTMENT_INBOX_READ_NAMES = [
  'marketing_list_inbox_conversations', 'marketing_get_inbox_conversation', 'marketing_list_inbox_reply_queue'
] as const
export const DEPARTMENT_INBOX_WRITE_NAMES = [
  'marketing_triage_inbox_conversation', 'marketing_add_inbox_note', 'marketing_draft_inbox_reply',
  'marketing_reject_inbox_reply', 'marketing_send_inbox_reply'
] as const
/** Writes whose effect leaves the application (platform reply); the rest are local transactions. */
export const DEPARTMENT_INBOX_PROVIDER_NAMES = ['marketing_send_inbox_reply'] as const
export type DepartmentInboxToolName = typeof DEPARTMENT_INBOX_READ_NAMES[number] | typeof DEPARTMENT_INBOX_WRITE_NAMES[number]

/** Approval-evidence record kind in the existing ai_pending_actions store; delivery stays on social_response_queue. */
export const INBOX_REPLY_FREEZE_ACTION = 'department_inbox_reply'

const uuid = z.string().uuid()
const hash = z.string().regex(/^[0-9a-f]{64}$/, 'Use the contentHash returned by the read')
const client = { clientId: uuid }
const status = z.enum(['open', 'snoozed', 'closed'])

export const departmentInboxContracts = {
  marketing_list_inbox_conversations: z.strictObject({
    ...client,
    status: status.optional(),
    channel: z.enum(['comment', 'dm', 'mention', 'review']).optional(),
    platform: z.enum(['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'google-business']).optional(),
    assignedTo: uuid.optional(),
    unassigned: z.boolean().default(false),
    breached: z.boolean().default(false),
    search: z.string().trim().min(1).max(100).optional(),
    offset: z.number().int().min(0).max(1000).default(0),
    limit: z.number().int().min(1).max(50).default(25)
  }),
  marketing_get_inbox_conversation: z.strictObject({
    ...client,
    conversationId: uuid,
    messageLimit: z.number().int().min(1).max(50).default(30)
  }),
  marketing_list_inbox_reply_queue: z.strictObject({
    ...client,
    status: z.enum(['actionable', 'pending', 'approved', 'rejected', 'sending', 'sent', 'failed', 'skipped']).default('actionable'),
    limit: z.number().int().min(1).max(50).default(25)
  }),
  marketing_triage_inbox_conversation: z.strictObject({
    ...client,
    conversationId: uuid,
    expected: z.strictObject({ status, assignedTo: z.string().max(64).nullable() }),
    patch: z.strictObject({
      status: status.optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable().optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
      assignedTo: uuid.nullable().optional(),
      snoozedUntil: z.string().datetime({ offset: true }).nullable().optional(),
      markRead: z.literal(true).optional()
    }).refine(p => Object.keys(p).length > 0, 'Patch must change at least one field')
      .refine(p => p.status !== 'snoozed' || !!p.snoozedUntil, 'Snoozing requires snoozedUntil'),
    acknowledgement: z.literal('TRIAGE_CLIENT_CONVERSATION')
  }),
  marketing_add_inbox_note: z.strictObject({
    ...client,
    conversationId: uuid,
    content: z.string().trim().min(1).max(5000),
    mentionUserIds: z.array(uuid).max(10).default([]),
    acknowledgement: z.literal('ADD_INTERNAL_INBOX_NOTE')
  }),
  marketing_draft_inbox_reply: z.strictObject({
    ...client,
    conversationId: uuid,
    /** The latest inbound message you read; a newer inbound message makes the draft stale. */
    expectedLatestInboundMessageId: uuid,
    content: z.string().trim().min(1).max(8000),
    acknowledgement: z.literal('DRAFT_CLIENT_SOCIAL_REPLY')
  }),
  marketing_reject_inbox_reply: z.strictObject({
    ...client,
    queueItemId: uuid,
    reason: z.string().trim().min(1).max(500),
    acknowledgement: z.literal('REJECT_CLIENT_SOCIAL_REPLY_DRAFT')
  }),
  marketing_send_inbox_reply: z.strictObject({
    ...client,
    queueItemId: uuid,
    conversationId: uuid,
    socialAccountId: uuid,
    replyTargetId: z.string().trim().min(1).max(255),
    expectedContentHash: hash,
    acknowledgement: z.literal('SEND_INDEPENDENTLY_REVIEWED_SOCIAL_REPLY')
  })
} satisfies Record<DepartmentInboxToolName, z.ZodTypeAny>
