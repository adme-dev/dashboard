import { describe, expect, it } from 'vitest'
import { PageStudioEmailEditSchema, PageStudioEmailSettingsSchema } from '~~/shared/pageStudio/emailConfiguration'

export const settings = { senderName: 'Synthetic Fleet', fromAddress: 'bookings@example.invalid', replyTo: 'team@example.invalid', notificationRecipient: 'staff@example.invalid', inboundAddress: '', forwardingDestination: '' }
describe('website email preferences input', () => {
  it('accepts bounded identities and an optional paired forwarding request', () => {
    expect(PageStudioEmailSettingsSchema.parse(settings)).toEqual(settings)
    expect(PageStudioEmailSettingsSchema.safeParse({ ...settings, inboundAddress: 'hello@example.invalid', forwardingDestination: 'inbox@example.invalid' }).success).toBe(true)
  })
  it.each(['verified', 'sendingEnabled', 'providerId', 'environment', 'apiToken'])('rejects caller-controlled %s', (key) => {
    expect(PageStudioEmailEditSchema.safeParse({ expectedRevision: 0, settings, [key]: true }).success).toBe(false)
    expect(PageStudioEmailSettingsSchema.safeParse({ ...settings, [key]: true }).success).toBe(false)
  })
  it.each(['fromAddress', 'replyTo', 'notificationRecipient', 'inboundAddress', 'forwardingDestination'])('rejects invalid or injected %s', (key) => {
    expect(PageStudioEmailSettingsSchema.safeParse({ ...settings, [key]: 'a@example.invalid\r\nBcc: victim@example.invalid' }).success).toBe(false)
  })
  it('requires paired forwarding fields, bounded names and nonnegative integral revisions', () => {
    expect(PageStudioEmailSettingsSchema.safeParse({ ...settings, inboundAddress: 'hello@example.invalid' }).success).toBe(false)
    expect(PageStudioEmailSettingsSchema.safeParse({ ...settings, senderName: 'a\nBcc: b' }).success).toBe(false)
    expect(PageStudioEmailSettingsSchema.safeParse({ ...settings, senderName: 'a'.repeat(121) }).success).toBe(false)
    for (const expectedRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER, '0']) expect(PageStudioEmailEditSchema.safeParse({ expectedRevision, settings }).success).toBe(false)
  })
})
