import { describe, expect, it } from 'vitest'
import { isInOfficeLobbyAvailabilityWindow } from '~~/app/utils/officeLobbyAvailability'

describe('office lobby availability windows', () => {
  it('allows times inside a same-day UTC window', () => {
    expect(isInOfficeLobbyAvailabilityWindow(
      '2026-05-25T09:30:00.000Z',
      [{ days: [1], start: '09:00', end: '10:00', timezone: 'UTC' }]
    )).toBe(true)
  })

  it('rejects times outside a same-day UTC window', () => {
    expect(isInOfficeLobbyAvailabilityWindow(
      '2026-05-25T10:30:00.000Z',
      [{ days: [1], start: '09:00', end: '10:00', timezone: 'UTC' }]
    )).toBe(false)
  })

  it('uses the configured timezone when matching weekdays and time', () => {
    expect(isInOfficeLobbyAvailabilityWindow(
      '2026-05-25T23:30:00.000Z',
      [{ days: [2], start: '09:00', end: '10:00', timezone: 'Australia/Melbourne' }]
    )).toBe(true)
  })

  it('supports overnight windows on the starting day', () => {
    expect(isInOfficeLobbyAvailabilityWindow(
      '2026-05-25T23:30:00.000Z',
      [{ days: [1], start: '22:00', end: '02:00', timezone: 'UTC' }]
    )).toBe(true)
  })

  it('supports overnight windows after midnight on the next day', () => {
    expect(isInOfficeLobbyAvailabilityWindow(
      '2026-05-26T01:30:00.000Z',
      [{ days: [1], start: '22:00', end: '02:00', timezone: 'UTC' }]
    )).toBe(true)
  })

  it('treats missing windows as unrestricted', () => {
    expect(isInOfficeLobbyAvailabilityWindow('2026-05-25T09:30:00.000Z', [])).toBe(true)
    expect(isInOfficeLobbyAvailabilityWindow('2026-05-25T09:30:00.000Z', null)).toBe(true)
  })
})
