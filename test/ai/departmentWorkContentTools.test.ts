import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const loaded = vi.hoisted(() => ({ work: false, content: false, calls: [] as unknown[][] }))
vi.mock('~~/server/utils/ai/marketing/departmentWorkOperations', () => {
  loaded.work = true
  return {
    runDepartmentWorkOperation: vi.fn(async (...args: unknown[]) => {
      loaded.calls.push(args)
      return { ok: true, data: {} }
    })
  }
})
vi.mock('~~/server/utils/ai/marketing/departmentContentOperations', () => {
  loaded.content = true
  return {
    runDepartmentContentOperation: vi.fn(async (...args: unknown[]) => {
      loaded.calls.push(args)
      return { ok: true, data: {} }
    })
  }
})

const { departmentWorkTools, executeDepartmentWorkTool } = await import('~~/server/utils/ai/mcp/departmentWorkTools')
const { departmentContentTools, executeDepartmentContentTool } = await import('~~/server/utils/ai/mcp/departmentContentTools')
const { DEPARTMENT_WORK_READ_NAMES, DEPARTMENT_WORK_WRITE_NAMES } = await import('~~/server/utils/ai/marketing/departmentWorkSchemas')
const { DEPARTMENT_CONTENT_READ_NAMES, DEPARTMENT_CONTENT_WRITE_NAMES } = await import('~~/server/utils/ai/marketing/departmentContentSchemas')

describe('department work/content MCP tool metadata', () => {
  it('exports the exact agreed names with explicit mutability', () => {
    expect(departmentWorkTools.map(t => [t.name, !!t.mutates])).toEqual([
      ['marketing_get_work_options', false], ['marketing_list_work_tasks', false], ['marketing_list_work_briefs', false],
      ['marketing_create_work_task', true], ['marketing_update_work_task', true], ['marketing_assign_work_task', true],
      ['marketing_set_work_task_status', true], ['marketing_assign_work_brief', true], ['marketing_set_work_brief_status', true]
    ])
    expect(departmentContentTools.map(t => [t.name, !!t.mutates])).toEqual([
      ['marketing_list_content_assets', false], ['marketing_get_content_asset', false],
      ['marketing_create_content_asset', true], ['marketing_create_content_version', true], ['marketing_submit_content_version', true],
      ['marketing_review_content_version', true], ['marketing_publish_content_version', true]
    ])
    expect([...DEPARTMENT_WORK_READ_NAMES, ...DEPARTMENT_WORK_WRITE_NAMES]).toEqual(departmentWorkTools.map(t => t.name))
    expect([...DEPARTMENT_CONTENT_READ_NAMES, ...DEPARTMENT_CONTENT_WRITE_NAMES]).toEqual(departmentContentTools.map(t => t.name))
  })

  it('projects object input schemas and requires an explicit acknowledgement on every mutation', () => {
    for (const tool of [...departmentWorkTools, ...departmentContentTools]) {
      const schema = z.toJSONSchema(tool.parameters) as { type: string, properties: Record<string, unknown>, additionalProperties?: boolean }
      expect(schema.type, tool.name).toBe('object')
      expect(schema.additionalProperties, tool.name).toBe(false)
      expect(tool.requiredPermission).toBe('MARKETING_MANAGEMENT')
      if (tool.mutates) expect(Object.keys(schema.properties), tool.name).toContain('acknowledgement')
    }
  })

  it('keeps metadata dependency-free and loads services only on execution', async () => {
    expect(loaded.work || loaded.content).toBe(false)
    for (const file of ['server/utils/ai/mcp/departmentWorkTools.ts', 'server/utils/ai/mcp/departmentContentTools.ts',
      'server/utils/ai/marketing/departmentWorkSchemas.ts', 'server/utils/ai/marketing/departmentContentSchemas.ts']) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from '[^']*(departmentWorkOperations|departmentContentOperations|server\/utils\/db|marketingPolicy|registry)'/)
    }
    await executeDepartmentWorkTool('marketing_list_work_tasks', { clientId: 'x' }, {} as never)
    await executeDepartmentContentTool('marketing_publish_content_version', {}, {} as never, 'k', 'd')
    expect(loaded).toMatchObject({ work: true, content: true })
    expect(loaded.calls.at(-1)).toEqual(['marketing_publish_content_version', {}, {}, 'k', 'd'])
  })

  it('never executes mutations through the generic handler and rejects unknown names', async () => {
    for (const tool of [...departmentWorkTools, ...departmentContentTools].filter(t => t.mutates)) {
      expect(await tool.handler({}, {} as never)).toMatchObject({ ok: false, code: 'coordinator_required' })
    }
    expect(await executeDepartmentWorkTool('create_task', {}, {} as never)).toMatchObject({ ok: false, code: 'not_found' })
    expect(await executeDepartmentContentTool('marketing_list_work_tasks', {}, {} as never)).toMatchObject({ ok: false, code: 'not_found' })
  })
})
