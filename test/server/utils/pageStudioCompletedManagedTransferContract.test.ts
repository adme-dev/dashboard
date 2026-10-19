import { expect, it } from 'vitest'

const module = () => import('~~/shared/pageStudio/completed-managed-transfer-management')
const base = { siteId: '00000000-0000-4000-8000-000000000001', completed: true, editorConnection: 'pending', sourceRetention: 'pending', canRetryConnection: true, canRetryRetention: true }
it('keeps completed editor and source states independent with verified explicit retry flags', async () => {
  const { CompletedManagedTransferStatusSchema: Schema } = await module()
  expect(Schema.parse(base)).toEqual(base)
  expect(Schema.parse({ ...base, editorConnection: 'ready', canRetryConnection: false })).toMatchObject({ sourceRetention: 'pending', canRetryRetention: true })
  for (const wrong of [{ ...base, completed: false }, { ...base, receipt: {} }, { ...base, editorConnection: 'ready' }, { ...base, sourceRetention: 'unavailable' }, { ...base, editorConnection: 'unavailable' }, { ...base, sourceRetention: 'retained' }])expect(Schema.safeParse(wrong).success).toBe(false)
})
