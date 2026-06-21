import { describe, it, expect, vi } from 'vitest'
import {
  renderRoomContext,
  resolveRoomContext,
  ROOM_BLOCK_HEADER,
  type RoomContext,
  type RoomContextDeps,
} from '~~/server/utils/ai/office/roomContext'

const room = (over: Partial<RoomContext> = {}): RoomContext => ({
  officeId: 'office-1',
  officeName: 'Sydney HQ',
  presentUsers: [],
  ...over,
})

describe('renderRoomContext (pure)', () => {
  it('null → empty string so the caller appends nothing', () => {
    expect(renderRoomContext(null)).toBe('')
  })

  it('renders office name + header', () => {
    const out = renderRoomContext(room())
    expect(out).toContain(ROOM_BLOCK_HEADER)
    expect(out).toContain('- Office: Sydney HQ')
  })

  it('notes a live meeting only when meetingId is set', () => {
    expect(renderRoomContext(room({ meetingId: 'm1' }))).toContain('live meeting')
    expect(renderRoomContext(room())).not.toContain('live meeting')
  })

  it('lists present users by name, or says none are present', () => {
    const out = renderRoomContext(room({ presentUsers: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Ben' }] }))
    expect(out).toContain('Present now (2): Ada, Ben')
    expect(renderRoomContext(room())).toContain('No other members are currently present.')
  })

  it('caps present users at 20 and flags overflow with +', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `u${i}`, name: `U${i}` }))
    const out = renderRoomContext(room({ presentUsers: many }))
    expect(out).toContain('Present now (20+):')
    expect(out).not.toContain('U24')
  })

  it('keeps the most-recent transcript tail and prefixes … when clipped', () => {
    const tail = 'OLDEST '.repeat(50) + 'NEWEST_LINE'
    const out = renderRoomContext(room({ transcriptTail: tail }), 20)
    expect(out).toContain('NEWEST_LINE')
    expect(out).toContain('…')
    expect(out).not.toContain('OLDEST OLDEST')
  })

  it('omits the transcript line when the tail is blank', () => {
    expect(renderRoomContext(room({ transcriptTail: '   ' }))).not.toContain('live transcript tail')
  })
})

describe('resolveRoomContext (tenant isolation)', () => {
  const baseDeps = (over: Partial<RoomContextDeps> = {}): RoomContextDeps => ({
    isMember: vi.fn(async () => true),
    getOfficeName: vi.fn(async () => 'Sydney HQ'),
    resolvePresentUsers: vi.fn(async () => []),
    ...over,
  })

  it('returns null for a non-member WITHOUT touching office name or roster (no leak)', async () => {
    const deps = baseDeps({ isMember: vi.fn(async () => false) })
    const out = await resolveRoomContext({ userId: 'intruder', officeId: 'office-1', deps })
    expect(out).toBeNull()
    expect(deps.getOfficeName).not.toHaveBeenCalled()
    expect(deps.resolvePresentUsers).not.toHaveBeenCalled()
  })

  it('returns null when the office cannot be found', async () => {
    const deps = baseDeps({ getOfficeName: vi.fn(async () => null) })
    expect(await resolveRoomContext({ userId: 'u1', officeId: 'gone', deps })).toBeNull()
  })

  it('returns null when officeId is empty without calling deps', async () => {
    const deps = baseDeps()
    expect(await resolveRoomContext({ userId: 'u1', officeId: '', deps })).toBeNull()
    expect(deps.isMember).not.toHaveBeenCalled()
  })

  it('populates a member room and resolves present names via the co-member-filtering dep', async () => {
    const resolvePresentUsers = vi.fn(async () => [{ id: 'a', name: 'Ada' }])
    const deps = baseDeps({ resolvePresentUsers })
    const out = await resolveRoomContext({
      userId: 'u1', officeId: 'office-1', meetingId: 'm1',
      presentUserIds: ['a', 'foreign-spoof'], transcriptTail: 'hi', deps,
    })
    expect(out).toEqual({
      officeId: 'office-1', officeName: 'Sydney HQ', meetingId: 'm1',
      presentUsers: [{ id: 'a', name: 'Ada' }], transcriptTail: 'hi',
    })
    // The spoofed id is passed to the dep, which filters to co-members — only Ada survives.
    expect(resolvePresentUsers).toHaveBeenCalledWith('office-1', ['a', 'foreign-spoof'])
  })

  it('skips roster resolution when no present ids are supplied', async () => {
    const deps = baseDeps()
    const out = await resolveRoomContext({ userId: 'u1', officeId: 'office-1', deps })
    expect(out?.presentUsers).toEqual([])
    expect(deps.resolvePresentUsers).not.toHaveBeenCalled()
  })

  it('drops blank/non-string present ids before resolving', async () => {
    const resolvePresentUsers = vi.fn(async () => [])
    const deps = baseDeps({ resolvePresentUsers })
    await resolveRoomContext({
      userId: 'u1', officeId: 'office-1',
      presentUserIds: ['a', '', null as any, undefined as any, 'b'], deps,
    })
    expect(resolvePresentUsers).toHaveBeenCalledWith('office-1', ['a', 'b'])
  })
})
