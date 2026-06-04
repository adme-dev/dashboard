import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryRowsMock = vi.fn()
const queryOneMock = vi.fn()
const executeMock = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => queryRowsMock(...args),
  queryOne: (...args: unknown[]) => queryOneMock(...args),
  execute: (...args: unknown[]) => executeMock(...args)
}))

describe('email marketing template metadata', () => {
  beforeEach(() => {
    queryRowsMock.mockReset()
    queryOneMock.mockReset()
    executeMock.mockReset()
  })

  it('persists template kind and folder name when creating a template', async () => {
    const { createTemplate } = await import('~~/server/utils/email-marketing/templates')
    queryOneMock.mockResolvedValueOnce({
      id: 'tpl-1',
      name: 'Draft newsletter',
      template_kind: 'draft',
      folder_name: 'Newsletters'
    })

    await createTemplate({
      name: 'Draft newsletter',
      template_kind: 'draft',
      folder_name: 'Newsletters',
      created_by: 'user-1'
    })

    const [sql, params] = queryOneMock.mock.calls[0]
    expect(sql).toContain('template_kind')
    expect(sql).toContain('folder_name')
    expect(params).toContain('draft')
    expect(params).toContain('Newsletters')
  })

  it('patches template kind and folder name without changing body source', async () => {
    const { updateTemplate } = await import('~~/server/utils/email-marketing/templates')
    queryOneMock
      .mockResolvedValueOnce({
        id: 'tpl-1',
        name: 'Saved template',
        subject: null,
        preview_text: null,
        body_source: { root: { type: 'EmailLayout', data: { childrenIds: [] } } },
        template_kind: 'template',
        folder_name: null
      })
      .mockResolvedValueOnce({
        id: 'tpl-1',
        name: 'Saved template',
        template_kind: 'draft',
        folder_name: 'Promos'
      })

    await updateTemplate('tpl-1', { template_kind: 'draft', folder_name: 'Promos' })

    const [sql, params] = queryOneMock.mock.calls[1]
    expect(sql).toContain('template_kind')
    expect(sql).toContain('folder_name')
    expect(params).toContain('draft')
    expect(params).toContain('Promos')
  })
})
