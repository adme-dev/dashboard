import { afterEach, describe, expect, it } from 'vitest'

import {
  getNotificationDeliveryStatus,
  isUserMemberNotificationDeliveryDisabled
} from '../../../server/utils/notificationDelivery'
import { setCachedCfBindings } from '../../../server/utils/cfBindings'

const originalValue = process.env.USER_MEMBER_NOTIFICATIONS_DISABLED

afterEach(() => {
  setCachedCfBindings({})
  if (originalValue === undefined) {
    delete process.env.USER_MEMBER_NOTIFICATIONS_DISABLED
  } else {
    process.env.USER_MEMBER_NOTIFICATIONS_DISABLED = originalValue
  }
})

describe('notification delivery control', () => {
  it('defaults internal member notification delivery to enabled', () => {
    delete process.env.USER_MEMBER_NOTIFICATIONS_DISABLED

    expect(isUserMemberNotificationDeliveryDisabled()).toBe(false)
    expect(getNotificationDeliveryStatus()).toMatchObject({
      disabled: false,
      scope: 'user_members',
      channels: {
        inApp: 'enabled',
        email: 'enabled',
        push: 'enabled'
      }
    })
  })

  it('pauses every internal member notification channel from process env', () => {
    process.env.USER_MEMBER_NOTIFICATIONS_DISABLED = 'true'

    expect(isUserMemberNotificationDeliveryDisabled()).toBe(true)
    expect(getNotificationDeliveryStatus()).toMatchObject({
      disabled: true,
      channels: {
        inApp: 'paused',
        email: 'paused',
        push: 'paused'
      }
    })
  })

  it('honours the Cloudflare Pages binding populated by middleware', () => {
    delete process.env.USER_MEMBER_NOTIFICATIONS_DISABLED
    setCachedCfBindings({ USER_MEMBER_NOTIFICATIONS_DISABLED: 'true' })

    expect(isUserMemberNotificationDeliveryDisabled()).toBe(true)
  })
})
