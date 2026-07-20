export const DEFAULT_NOTIFICATION_PREFERENCES = {
  email_task_assigned: false,
  email_task_mentioned: false,
  email_task_due: false,
  email_approval_request: false,
  email_weekly_digest: false,
  email_board_member_added: false,
  email_brief_assigned: false,
  email_brief_status: false,
  email_brief_comment: false,
  inapp_task_assigned: false,
  inapp_task_mentioned: false,
  inapp_task_status: false,
  inapp_task_comment: false,
  inapp_task_due: false,
  inapp_approval: false,
  inapp_board_member_added: false,
  inapp_brief_assigned: false,
  inapp_brief_status: false,
  inapp_brief_comment: false,
  inapp_chat_mention: false,
  inapp_chat_dm: false
} as const

export type NotificationPreferenceKey = keyof typeof DEFAULT_NOTIFICATION_PREFERENCES

export const NOTIFICATION_PREFERENCE_KEYS = Object.keys(
  DEFAULT_NOTIFICATION_PREFERENCES
) as NotificationPreferenceKey[]

export function isNotificationPreferenceEnabled(
  preferences: Record<string, unknown> | null | undefined,
  key: NotificationPreferenceKey
): boolean {
  return preferences?.[key] === true
}
