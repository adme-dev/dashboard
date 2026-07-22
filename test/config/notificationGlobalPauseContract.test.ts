import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('global member notification pause contract', () => {
  it('is active in the production deployment configuration', () => {
    expect(source('wrangler.toml')).toContain('USER_MEMBER_NOTIFICATIONS_DISABLED = "true"')
  })

  it('gates both in-app creation and direct web push delivery', () => {
    expect(source('server/utils/notifications.ts')).toContain('isUserMemberNotificationDeliveryDisabled()')
    expect(source('server/utils/webPush.ts')).toContain('isUserMemberNotificationDeliveryDisabled()')
  })

  it('shows authoritative pause state in personal and admin settings', () => {
    const personal = source('app/pages/settings/notifications.vue')
    const admin = source('app/pages/settings/admin.vue')

    expect(personal).toContain('/api/notifications/delivery-status')
    expect(personal).toContain('Notifications are paused by an administrator')
    expect(personal).toContain(':disabled="notificationsGloballyDisabled')
    expect(admin).toContain('value: \'notifications\'')
    expect(admin).toContain('/api/notifications/delivery-status')
    expect(admin).toContain('Member notification delivery')
  })
})
