import { describe, it, expect } from 'vitest'
import { parseScopeHeader, hasWriteScope, isWriteScopeToolName, MCP_WRITE_SCOPE } from '~~/server/utils/ai/mcp/scope'

describe('parseScopeHeader', () => {
  it('parses space- and comma-separated scopes', () => {
    expect([...parseScopeHeader('mcp:read mcp:write')]).toEqual(['mcp:read', 'mcp:write'])
    expect([...parseScopeHeader('mcp:read, mcp:write')]).toEqual(['mcp:read', 'mcp:write'])
  })
  it('is empty for null/undefined/blank', () => {
    expect(parseScopeHeader(null).size).toBe(0)
    expect(parseScopeHeader(undefined).size).toBe(0)
    expect(parseScopeHeader('   ').size).toBe(0)
  })
})

describe('hasWriteScope', () => {
  it('true only when mcp:write is present', () => {
    expect(hasWriteScope(parseScopeHeader('mcp:read'))).toBe(false)
    expect(hasWriteScope(parseScopeHeader('mcp:read mcp:write'))).toBe(true)
    expect(MCP_WRITE_SCOPE).toBe('mcp:write')
  })
})

describe('isWriteScopeToolName', () => {
  it('classifies every write-class MCP tool name as requiring write scope', () => {
    for (const name of [
      'confirm_action',
      'propose_create_task',        // 2c safe propose
      'propose_budget_change',      // financial money-mover
      'propose_quote',              // financial (crm)
      'propose_video_generation',   // video propose
      'create_video_project',       // video project create
      'propose_banner_render',      // banner propose
      'generate_voiceover',         // billing generation
      'start_music_generation',     // billing generation
      'remember',                   // durable personal-memory write
    ]) {
      expect(isWriteScopeToolName(name), name).toBe(true)
    }
  })

  it('treats pure reads as NOT requiring write scope', () => {
    for (const name of [
      'search_crm',
      'get_generation_status',          // generation poll = read
      'get_video_generation_status',
      'get_banner_render_status',
      'list_banner_projects',
    ]) {
      expect(isWriteScopeToolName(name), name).toBe(false)
    }
  })
})
