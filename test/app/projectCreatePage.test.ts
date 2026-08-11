import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../app/pages/agency/projects/new.vue', import.meta.url), 'utf8')

describe('new project page', () => {
  it('passes the project name and selected manager through template creation', () => {
    expect(page).toContain('projectName: form.value.name || selectedTemplate.value.name')
    expect(page).toContain('projectManagerId: form.value.projectManagerId')
  })

  it('uses a responsive field grid and a non-empty unassigned manager value', () => {
    expect(page).toContain('@container')
    expect(page).toContain('@lg:grid-cols-2')
    expect(page).toContain('value: \'__unassigned__\'')
    expect(page).not.toContain('{ label: \'Not assigned\', value: null }')
  })
})
