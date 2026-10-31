import { apiErrorDescription } from './apiError'

export interface MotorStackBrand {
  id: string
  name: string
  existingKitId: string | null
}

export interface MotorStackImportResult {
  status: 'imported' | 'existing' | 'skipped'
  brandId: string
  brandName: string
  kitId: string | null
  warnings: string[]
  counts: { fonts: number, logos: number, colors: number }
}

export interface MotorStackImportRow extends MotorStackBrand {
  status: 'pending' | 'importing' | 'failed' | MotorStackImportResult['status']
  result?: MotorStackImportResult
  error?: string
}

export function motorStackImportRows(brands: MotorStackBrand[]): MotorStackImportRow[] {
  return brands.map(brand => ({ ...brand, status: 'pending' }))
}

/** One write at a time. Stopping never aborts a write whose result may already be saved. */
export async function runMotorStackImport(
  rows: MotorStackImportRow[],
  importBrand: (brandId: string) => Promise<MotorStackImportResult>,
  shouldStop: () => boolean = () => false
): Promise<void> {
  for (const row of rows) {
    if (shouldStop()) break
    if (row.status !== 'pending' && row.status !== 'failed') continue
    row.status = 'importing'
    row.error = undefined
    try {
      const result = await importBrand(row.id)
      if (result.brandId !== row.id || !['imported', 'existing', 'skipped'].includes(result.status)
        || (result.status !== 'skipped' && !result.kitId)) {
        throw new Error('Could not verify the imported kit. Retry to check its saved status.')
      }
      row.result = result
      row.status = result.status
      if (result.kitId) row.existingKitId = result.kitId
    } catch (error) {
      row.status = 'failed'
      row.error = apiErrorDescription(error, 'Import failed. Retry this brand to check its saved status.')
    }
  }
}
