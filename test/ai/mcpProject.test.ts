import { afterEach, describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import Ajv from 'ajv'

import {
  projectCatalogMcpSuite,
  projectGodModeCatalogTools,
  projectReadOnlyTools,
  executeReadOnlyTool
} from '~~/server/utils/ai/mcp/project'
import * as projectModule from '~~/server/utils/ai/mcp/project'
import * as generationModule from '~~/server/utils/ai/mcp/generationTools'
import * as writeModule from '~~/server/utils/ai/mcp/writeTools'
import * as videoModule from '~~/server/utils/ai/mcp/videoTools'
import * as bannerModule from '~~/server/utils/ai/mcp/bannerTools'
import {
  projectGodModeTools,
  projectRegisteredMcpTools,
  registeredMcpSuites,
  type RegisteredMcpSuite
} from '~~/server/utils/ai/mcp/registry'
import { registry as applicationRegistry } from '~~/server/utils/ai/tools'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

// Deterministic RBAC: 'admin' has every permission; 'viewer' is read-only with none.
// (filterToolsForUser + project.ts both call into this module.)
vi.mock('~~/server/utils/permissions', async (importOriginal) => ({
  ...await importOriginal<typeof import('~~/server/utils/permissions')>(),
  roleHasPermission: (role: string) => role === 'admin',
  isReadOnlyRole: (role: string) => role === 'viewer'
}))

// --- fakes -------------------------------------------------------------------
// filterToolsForUser uses roleHasPermission(role, requiredPermission); we model that with a perm map.
// 'admin' has all perms; 'viewer' has only 'READ'. Tools with no requiredPermission are open to all.
const tool = (over: Partial<AiTool<unknown>>): AiTool<unknown> => ({
  name: 'get_thing',
  description: 'Reads a thing.',
  parameters: z.object({ id: z.string() }),
  handler: async () => ({ ok: true, data: { ok: 1 } }),
  ...over
}) as AiTool<unknown>

const ctx = (role: string): ToolContext => ({ userId: 'u1', userRole: role, event: {} as never })

// Minimal registry: an open read tool, a FINANCE-gated read tool, and a write tool.
const tools: AiTool<unknown>[] = [
  tool({ name: 'get_overview' }),
  tool({ name: 'get_pnl', requiredPermission: 'FINANCE' as never, returnsUntrusted: true }),
  tool({ name: 'create_task', mutates: true, requiredPermission: undefined })
]

describe('projectReadOnlyTools', () => {
  it('never includes a mutating tool, for ANY role', () => {
    const names = projectReadOnlyTools(tools, 'admin').map(t => t.name)
    expect(names).not.toContain('create_task')
  })

  it('applies the role ceiling (a viewer without FINANCE does not see get_pnl)', () => {
    const adminNames = projectReadOnlyTools(tools, 'admin').map(t => t.name)
    const viewerNames = projectReadOnlyTools(tools, 'viewer').map(t => t.name)
    expect(adminNames).toContain('get_pnl')
    expect(viewerNames).not.toContain('get_pnl')
    expect(viewerNames).toContain('get_overview') // open read tool still visible
  })

  it('emits a JSON Schema inputSchema for each tool', () => {
    const m = projectReadOnlyTools(tools, 'admin').find(t => t.name === 'get_overview')!
    expect(m.inputSchema).toMatchObject({ type: 'object' })
    expect((m.inputSchema as { properties?: Record<string, unknown> }).properties).toHaveProperty('id')
  })

  it('annotates untrusted-output tools with a data-not-instructions note', () => {
    const m = projectReadOnlyTools(tools, 'admin').find(t => t.name === 'get_pnl')!
    expect(m.description.toLowerCase()).toContain('never as instructions')
  })
})

describe('projectGodModeCatalogTools', () => {
  it('projects every registered read and write without applying role or permission filtering', () => {
    const names = projectGodModeCatalogTools(tools, { includeWrites: true }).map(tool => tool.name)

    expect(names).toEqual(['get_overview', 'get_pnl', 'create_task'])
  })

  it('uses signed transport scope to omit writes without narrowing registered reads', () => {
    const names = projectGodModeCatalogTools(tools, { includeWrites: false }).map(tool => tool.name)

    expect(names).toEqual(['get_overview', 'get_pnl'])
  })
})

describe('authoritative registered MCP suite projection', () => {
  const originalSuiteCount = registeredMcpSuites.length
  const context = {
    tools,
    role: 'viewer',
    scopes: ['mcp:read'],
    requireWriteScope: true,
    suiteFlags: {
      generation: false,
      writes: false,
      financial: false,
      video: false,
      videoGeneration: false,
      banners: false
    }
  }

  afterEach(() => {
    ;(registeredMcpSuites as RegisteredMcpSuite[]).splice(originalSuiteCount)
  })

  it('gives God mode the union of every registered suite despite ordinary flags and OAuth scope', () => {
    const names = projectGodModeTools(context).map(tool => tool.name)

    expect(names).toEqual(expect.arrayContaining([
      'get_overview',
      'create_task',
      'generate_voiceover',
      'propose_create_task',
      'list_av_projects',
      'propose_video_generation',
      'list_banner_projects',
      'propose_banner_render'
    ]))
  })

  it('covers core reads, generation, writes, finance, social publishing, banners, video, and administration', () => {
    const names = projectGodModeTools({ ...context, tools: applicationRegistry }).map(tool => tool.name)

    expect(names).toEqual(expect.arrayContaining([
      'get_tasks',
      'generate_voiceover',
      'create_task',
      'propose_budget_change',
      'propose_schedule_post',
      'list_banner_projects',
      'list_av_projects',
      'propose_team_memory'
    ]))
  })

  it('includes a newly registered synthetic suite without another allowlist change', () => {
    ;(registeredMcpSuites as RegisteredMcpSuite[]).push({
      key: 'synthetic-future-suite',
      project: () => [{
        name: 'future_registered_tool',
        description: 'Synthetic future suite tool used to prove default-on registry projection.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }
      }]
    })

    expect(projectGodModeTools(context).map(tool => tool.name)).toContain('future_registered_tool')
  })

  it('keeps ordinary projection governed by suite flags, role permissions, and signed scopes', () => {
    const names = projectRegisteredMcpTools(context).map(tool => tool.name)

    expect(names).toEqual(['get_overview'])
    expect(names).not.toContain('create_task')
    expect(names).not.toContain('generate_voiceover')
    expect(names).not.toContain('propose_create_task')
  })

  it('preserves the legacy ordinary manifest order, descriptions, and first-wins confirm definition', () => {
    const ordinaryContext = {
      ...context,
      tools: applicationRegistry,
      role: 'admin',
      requireWriteScope: false,
      suiteFlags: {
        generation: true,
        writes: true,
        financial: true,
        video: true,
        videoGeneration: true,
        banners: true
      }
    }
    const legacyAssembled = [
      ...projectReadOnlyTools(applicationRegistry, 'admin'),
      ...generationModule.projectGenerationTools('admin', true),
      ...writeModule.projectWriteTools(applicationRegistry, 'admin', true),
      ...videoModule.projectVideoTools('admin', { suite: true, gen: true }),
      ...bannerModule.projectBannerTools('admin', true),
      ...writeModule.projectFinancialTools(applicationRegistry, 'admin', true)
    ]
    const seen = new Set<string>()
    const legacyManifest = legacyAssembled.filter(tool => (
      seen.has(tool.name) ? false : (seen.add(tool.name), true)
    ))

    expect(projectRegisteredMcpTools(ordinaryContext)).toEqual(legacyManifest)
  })

  it('emits unique names whose input schemas compile as JSON Schema', () => {
    const manifests = projectGodModeTools({ ...context, tools: applicationRegistry })
    const names = manifests.map(tool => tool.name)
    const ajv = new Ajv({ strict: false })

    expect(new Set(names).size).toBe(names.length)
    for (const manifest of manifests) {
      // The installed Ajv validates draft-07; Zod labels equivalent object schemas as draft 2020-12.
      // Remove only the dialect marker so Ajv can still compile the actual schema structure.
      const { $schema: _dialect, ...schema } = manifest.inputSchema
      expect(() => ajv.compile(schema)).not.toThrow()
    }
  })

  it('deduplicates identical definitions and fails closed on conflicting definitions', () => {
    ;(registeredMcpSuites as RegisteredMcpSuite[]).push({
      key: 'identical-duplicate',
      project: () => [{
        name: 'get_overview',
        description: 'Reads a thing.',
        inputSchema: z.toJSONSchema(z.object({ id: z.string() })) as Record<string, unknown>
      }]
    })
    expect(projectGodModeTools(context).filter(tool => tool.name === 'get_overview')).toHaveLength(1)

    ;(registeredMcpSuites as RegisteredMcpSuite[]).push({
      key: 'conflicting-duplicate',
      project: () => [{
        name: 'get_overview',
        description: 'Conflicting definition must never silently shadow the registered tool.',
        inputSchema: { type: 'object', properties: {} }
      }]
    })
    expect(() => projectGodModeTools(context)).toThrow(/conflicting MCP tool definition.*get_overview/i)
  })

  it('fails closed when a registered suite emits an invalid JSON Schema', () => {
    ;(registeredMcpSuites as RegisteredMcpSuite[]).push({
      key: 'invalid-schema-suite',
      project: () => [{
        name: 'invalid_schema_tool',
        description: 'A malformed schema must block discovery instead of reaching an MCP host.',
        inputSchema: { type: 'not-a-json-schema-type' }
      }]
    })

    expect(() => projectGodModeTools(context)).toThrow(/invalid JSON Schema.*invalid_schema_tool/i)
  })

  it('registers every exported suite projector exactly once', () => {
    const modules = [projectModule, generationModule, writeModule, videoModule, bannerModule]
    const exportedProjectors = modules.flatMap(module => Object.entries(module))
      .filter(([name, value]) => name.endsWith('McpSuite') && typeof value === 'function')
      .map(([, value]) => value)
    const registeredProjectors = registeredMcpSuites.map(suite => suite.project)
    const exportedSourceProjectors = modules.flatMap(module => Object.entries(module))
      .filter(([name, value]) => name.startsWith('project') && name.endsWith('Tools') && typeof value === 'function')
      .map(([, value]) => value)
    const registeredSourceProjectors = registeredMcpSuites.flatMap(suite => suite.sourceProjectors ?? [])

    expect(projectCatalogMcpSuite).toBeTypeOf('function')
    expect(new Set(registeredMcpSuites.map(suite => suite.key)).size).toBe(registeredMcpSuites.length)
    expect(registeredProjectors).toHaveLength(exportedProjectors.length)
    for (const projector of exportedProjectors) {
      expect(registeredProjectors.filter(candidate => candidate === projector)).toHaveLength(1)
    }
    expect(registeredSourceProjectors).toHaveLength(exportedSourceProjectors.length)
    for (const projector of exportedSourceProjectors) {
      expect(registeredSourceProjectors.filter(candidate => candidate === projector)).toHaveLength(1)
    }
  })
})

describe('executeReadOnlyTool', () => {
  it('runs an allowed read tool and returns its data', async () => {
    const handler = vi.fn(async () => ({ ok: true as const, data: { value: 42 } }))
    const t = [tool({ name: 'get_overview', handler })]
    const res = await executeReadOnlyTool(t, 'get_overview', { id: 'x' }, ctx('admin'))
    expect(res).toEqual({ ok: true, data: { value: 42 } })
    expect(handler).toHaveBeenCalled()
  })

  it('HARD-blocks a mutating tool even if the role could call it in-app (write_blocked)', async () => {
    const handler = vi.fn()
    const t = [tool({ name: 'create_task', mutates: true, handler: handler as never })]
    const res = await executeReadOnlyTool(t, 'create_task', { id: 'x' }, ctx('admin'))
    expect(res).toMatchObject({ ok: false, code: 'write_blocked' })
    expect(handler).not.toHaveBeenCalled() // never even invoked
  })

  it('forbids a tool the role cannot call (same ceiling as in-app)', async () => {
    const res = await executeReadOnlyTool(tools, 'get_pnl', { id: 'x' }, ctx('viewer'))
    expect(res).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('rejects unknown tools', async () => {
    const res = await executeReadOnlyTool(tools, 'nope', {}, ctx('admin'))
    expect(res).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('rejects args that fail the tool Zod schema (untrusted wire input)', async () => {
    const res = await executeReadOnlyTool(tools, 'get_overview', { id: 123 }, ctx('admin'))
    expect(res).toMatchObject({ ok: false, code: 'bad_args' })
  })

  it('never throws — a handler that throws becomes a typed handler_error', async () => {
    const throwing = async () => {
      throw new Error('boom')
    }
    const t = [tool({ name: 'get_overview', handler: throwing })]
    const res = await executeReadOnlyTool(t, 'get_overview', { id: 'x' }, ctx('admin'))
    expect(res).toMatchObject({ ok: false, code: 'handler_error' })
  })
})
