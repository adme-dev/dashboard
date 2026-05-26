import { describe, expect, it } from 'vitest'
import {
  ZoneAclSchema,
  ZoneCapacitySchema,
  ZoneNameSchema,
  ZonePositionSchema,
  ZoneSlugSchema,
  ZoneTypeSchema
} from '~~/server/utils/officeZoneValidation'

describe('officeZoneValidation', () => {
  it('normalizes ACL arrays and true public lobby access', () => {
    expect(ZoneAclSchema.parse({
      allowed_roles: ['member', 'member', 'admin'],
      allowed_clients: [
        '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111'
      ],
      public_lobby: true
    })).toEqual({
      allowed_roles: ['member', 'admin'],
      allowed_clients: ['11111111-1111-4111-8111-111111111111'],
      public_lobby: true
    })
  })

  it('omits empty arrays and false public lobby access', () => {
    expect(ZoneAclSchema.parse({
      allowed_roles: [],
      allowed_clients: [],
      public_lobby: false
    })).toEqual({})
  })

  it('rejects unsupported roles', () => {
    expect(() => ZoneAclSchema.parse({
      allowed_roles: ['owner']
    })).toThrow()
  })

  it('validates non-negative positions with positive dimensions', () => {
    expect(ZonePositionSchema.parse({
      x: 0,
      y: 12,
      w: 240,
      h: 160
    })).toEqual({
      x: 0,
      y: 12,
      w: 240,
      h: 160
    })
  })

  it('rejects negative positions', () => {
    expect(() => ZonePositionSchema.parse({
      x: -1,
      y: 12,
      w: 240,
      h: 160
    })).toThrow()
  })

  it('validates positive integer capacity', () => {
    expect(ZoneCapacitySchema.parse(4)).toBe(4)
    expect(() => ZoneCapacitySchema.parse(0)).toThrow()
    expect(() => ZoneCapacitySchema.parse(1.5)).toThrow()
  })

  it('validates supported zone types', () => {
    expect(ZoneTypeSchema.parse('meeting')).toBe('meeting')
    expect(ZoneTypeSchema.parse('client_lounge')).toBe('client_lounge')
    expect(() => ZoneTypeSchema.parse('kitchen')).toThrow()
  })

  it('validates and trims zone names', () => {
    expect(ZoneNameSchema.parse('  Meeting Room A  ')).toBe('Meeting Room A')
    expect(() => ZoneNameSchema.parse('   ')).toThrow()
  })

  it('validates and trims zone slugs', () => {
    expect(ZoneSlugSchema.parse('  meeting-room-a  ')).toBe('meeting-room-a')
    expect(() => ZoneSlugSchema.parse('Meeting Room A')).toThrow()
    expect(() => ZoneSlugSchema.parse('room_a')).toThrow()
  })
})
