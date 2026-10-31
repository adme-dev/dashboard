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

const IMPORT_ERRORS: Record<string, string> = {
  font_invalid: 'A source font could not be validated. Check the font file in MotorStack, then retry this brand. No partial kit was saved.',
  logo_invalid: 'A source logo uses invalid or unsupported content. Check the logo file in MotorStack, then retry this brand. No partial kit was saved.',
  source_timeout: 'MotorStack took too long to respond. Retry this brand.',
  not_configured: 'The MotorStack connection is not configured. Ask an administrator to check it, then retry.',
  limit_exceeded: 'This brand exceeds the supported file size or kit limits. Check its source assets before retrying.',
  metadata_invalid: 'MotorStack returned inconsistent brand details. Refresh the source details, then retry this brand.',
  source_unavailable: 'A MotorStack source file or connection is unavailable. Retry this brand; if it continues, check its source files.',
  import_failed: 'The import could not be confirmed. Retry this brand to check its saved status.'
}
export function motorStackImportErrorDescription(error: unknown): string {
  const payload = error && typeof error === 'object' && 'data' in error ? error.data : undefined
  const details = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload
  const reason = details && typeof details === 'object' && 'reasonCode' in details ? details.reasonCode : undefined
  if (typeof reason === 'string' && Object.hasOwn(IMPORT_ERRORS, reason)) return IMPORT_ERRORS[reason]!
  return apiErrorDescription(error, 'Import failed. Retry this brand to check its saved status.')
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
      row.error = motorStackImportErrorDescription(error)
    }
  }
}
