import { describe, expect, it, vi } from 'vitest'
import {
  assertLibraryOperationNamespace,
  publishDesignLibraryAsset
} from '../../server/utils/email-marketing/designLibraryOperations'
import type { DesignAssetStorage } from '../../server/utils/email-marketing/designAssets'

const actor = '10000000-0000-4000-8000-000000000001',
  operation = '20000000-0000-4000-8000-000000000001'
describe('library actor/action receipt namespace', () => {
  it.each(['revision', 'asset'] as const)(
    'rejects %s commands whose action belongs to the other receipt owner',
    async (owner) => {
      const db = { query: vi.fn(async () => ({ rows: [{ operation_id: operation }] })) }
      await expect(assertLibraryOperationNamespace(db, actor, operation, owner)).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT'
      })
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining(
          owner === 'revision' ? 'email_asset_publication_receipts' : 'email_design_revision_receipts'
        ),
        [actor, operation]
      )
    }
  )
  it('rejects an image publication reusing a revision action before touching storage or media', async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes('FROM email_design_revision_receipts') ? [{ operation_id: operation }] : []
    }))
    const read = vi.fn(),
      url = vi.fn(),
      identifyUrl = vi.fn()
    const storage: DesignAssetStorage = { read, url, identifyUrl }
    await expect(
      publishDesignLibraryAsset(
        { version: 1, operationId: operation, assetId: operation },
        actor,
        async () => {},
        storage,
        callback => callback({ query })
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(read).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(2)
  })
})
