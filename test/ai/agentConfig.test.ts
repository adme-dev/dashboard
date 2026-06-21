import { describe, it, expect, vi } from 'vitest'
import { narrowToolsByConfig, getAgentConfig, saveAgentConfig, type AgentConfigDb } from '~~/server/utils/ai/agentConfig'

const tools = [{ name: 'get_finance_snapshot' }, { name: 'create_task' }, { name: 'remember' }]

describe('narrowToolsByConfig (config narrows, never grants)', () => {
  it('subtracts disabled tools from the permitted set', () => {
    expect(narrowToolsByConfig(tools, ['create_task']).map(t => t.name)).toEqual(['get_finance_snapshot', 'remember'])
  })
  it('CAN ONLY SUBTRACT — a disabled name not in the set adds nothing (never grants)', () => {
    // even if config names a tool the user doesn't have, the result is a subset of the input.
    const out = narrowToolsByConfig(tools, ['get_admin_secret', 'nonexistent'])
    expect(out).toEqual(tools)
    expect(out.length).toBeLessThanOrEqual(tools.length)
  })
  it('no/empty overrides → unchanged', () => {
    expect(narrowToolsByConfig(tools, undefined)).toEqual(tools)
    expect(narrowToolsByConfig(tools, [])).toEqual(tools)
  })
})

const db = (over: Partial<AgentConfigDb> = {}): AgentConfigDb => ({
  queryOne: vi.fn().mockResolvedValue(null),
  execute: vi.fn().mockResolvedValue(undefined),
  ...over,
})

describe('getAgentConfig', () => {
  it('parses a row into the config shape', async () => {
    const d = db({ queryOne: vi.fn().mockResolvedValue({ persona_key: 'finance', tool_overrides: { disabled: ['create_task', 7] }, memory_enabled: false }) })
    expect(await getAgentConfig('u1', d)).toEqual({ ownerUserId: 'u1', personaKey: 'finance', disabledTools: ['create_task'], memoryEnabled: false })
  })
  it('returns null when there is no config, and never throws on a db error (fail-safe)', async () => {
    expect(await getAgentConfig('u1', db())).toBeNull()
    expect(await getAgentConfig('', db())).toBeNull()
    expect(await getAgentConfig('u1', db({ queryOne: vi.fn().mockRejectedValue(new Error('down')) }))).toBeNull()
  })
})

describe('saveAgentConfig', () => {
  it('upserts the personal config with a disabled-tools payload', async () => {
    const d = db()
    await saveAgentConfig({ userId: 'u1', personaKey: 'finance', disabledTools: ['create_task'], memoryEnabled: true }, d)
    const call = (d.execute as any).mock.calls[0]
    expect(call[1][0]).toBe('u1')
    expect(JSON.parse(call[1][2])).toEqual({ disabled: ['create_task'] })
  })
})
