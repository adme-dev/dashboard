import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../../server/database/migrations/371_google_pmax_auto_rollout.sql', import.meta.url),
  'utf8'
)

describe('Google PMax automatic rollout migration', () => {
  it('binds approval to the governed project template and task expansion', () => {
    expect(sql).toContain('lower(trim(name)) = \'google pmax inventory launch\'')
    expect(sql).toContain('project_template_id = v_project_template_id')
    expect(sql).toContain('auto_convert_on_approval = true')
    expect(sql).toContain('WHERE slug = \'google-pmax\'')
  })
})
