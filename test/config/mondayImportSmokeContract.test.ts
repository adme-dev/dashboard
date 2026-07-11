import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/utils/mondayMigration.ts', 'utf8')

describe('Monday import smoke contract', () => {
  it('covers paginated items and optional subitems', () => {
    expect(source).toContain('while (cursor)')
    expect(source).toContain('this.config.importSubitems')
  })

  it('does not duplicate comments or files on rerun', () => {
    expect(source).toContain('FROM monday_update_mappings WHERE monday_update_id')
    expect(source).toContain('FROM monday_file_mappings WHERE monday_asset_id')
    expect(source).toContain('this.client.downloadFile(asset.id)')
  })
})
