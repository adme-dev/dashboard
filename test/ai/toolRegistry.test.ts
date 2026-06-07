import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { filterToolsForUser, type AiTool } from '~~/server/utils/ai/toolRegistry'
import { ok } from '~~/server/utils/ai/toolContext'

const reg: AiTool<any>[] = [
  { name: 'get_x', description: 'd', parameters: z.object({}), requiredPermission: 'FINANCE', handler: async () => ok({}) },
  { name: 'get_y', description: 'd', parameters: z.object({}), handler: async () => ok({}) }, // any authed
]

describe('filterToolsForUser', () => {
  it('excludes tools the role lacks permission for', () => {
    const team = filterToolsForUser(reg, 'creative') // not in FINANCE
    expect(team.map(t => t.name)).toEqual(['get_y'])
  })

  it('includes permissioned tools for a finance role', () => {
    const fin = filterToolsForUser(reg, 'finance') // in FINANCE
    expect(fin.map(t => t.name).sort()).toEqual(['get_x', 'get_y'])
  })

  it('owner (superset role) sees finance tools too', () => {
    const owner = filterToolsForUser(reg, 'owner')
    expect(owner.map(t => t.name).sort()).toEqual(['get_x', 'get_y'])
  })

  it('fail-closed: an unknown/custom role gets only unrestricted tools', () => {
    const custom = filterToolsForUser(reg, 'some_custom_role')
    expect(custom.map(t => t.name)).toEqual(['get_y'])
  })
})
