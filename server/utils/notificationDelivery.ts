import { getCachedCfBinding } from '~~/server/utils/cfBindings'

export const USER_MEMBER_NOTIFICATIONS_DISABLED_KEY = 'USER_MEMBER_NOTIFICATIONS_DISABLED'

export interface NotificationDeliveryStatus {
  disabled: boolean
  scope: 'user_members'
  channels: {
    inApp: 'paused' | 'enabled'
    email: 'paused' | 'enabled'
    push: 'paused' | 'enabled'
  }
  reason: string
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

export function isUserMemberNotificationDeliveryDisabled(): boolean {
  const configuredValue = getCachedCfBinding(USER_MEMBER_NOTIFICATIONS_DISABLED_KEY)
    ?? process.env.USER_MEMBER_NOTIFICATIONS_DISABLED
  return isTrue(configuredValue)
}

export function getNotificationDeliveryStatus(): NotificationDeliveryStatus {
  const disabled = isUserMemberNotificationDeliveryDisabled()
  const channelState = disabled ? 'paused' : 'enabled'

  return {
    disabled,
    scope: 'user_members',
    channels: {
      inApp: channelState,
      email: channelState,
      push: channelState
    },
    reason: disabled
      ? 'Internal user and member notifications are paused by an administrator.'
      : 'Internal user and member notifications follow each user’s saved preferences.'
  }
}

export function suppressMemberNotificationEmail(template: string): boolean {
  if (!isUserMemberNotificationDeliveryDisabled()) return false
  console.info('[NotificationDelivery] Suppressed member notification email', { template })
  return true
}
