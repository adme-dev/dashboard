import { describe, expect, it } from 'vitest'
import { ROLE_SKILL_DEFINITIONS } from '~~/server/utils/ai/roleSkills/definitions'
import { registry } from '~~/server/utils/ai/tools/index'
import { DEPARTMENT_TOOL_NAMES } from '~~/server/utils/ai/mcp/departmentToolNames'
import { NATIVE_SUPPLEMENTAL_TOOL_NAMES } from '~~/server/utils/ai/nativeToolNames'
import { PERSONAS } from '~~/server/utils/ai/personas'

describe('curated role workflow capability contracts', () => {
  it('uses registered native tool names and compatible persona allowlists', () => {
    const known = new Set([...registry.map(tool => tool.name), ...DEPARTMENT_TOOL_NAMES, ...NATIVE_SUPPLEMENTAL_TOOL_NAMES])
    for (const workflow of ROLE_SKILL_DEFINITIONS) {
      const persona = PERSONAS[workflow.persona]
      expect(persona, workflow.key).toBeDefined()
      for (const name of workflow.tools) {
        expect(known.has(name), `${workflow.key}: ${name}`).toBe(true)
        if (persona.toolAllowlist) expect(persona.toolAllowlist, workflow.key).toContain(name)
      }
      for (const source of workflow.sources) {
        expect(new URL(source.url).protocol).toBe('https:')
        if (new URL(source.url).hostname === 'github.com') expect(source.url).toMatch(/\/blob\/[a-f0-9]{40}\//)
      }
    }
  })
})
