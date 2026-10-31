import { ZodError } from 'zod'
import { clientFromHint, packageFile, parseTheBriefPackage, suggestImportClient, type TheBriefPackage } from './thebrief-import'
import { bannerFolderForSource } from './banner-folders'
import type { BannerFolder } from '~/types/banner-studio'

/** Ready / Needs attention / Invalid come from the selection; the rest from an import attempt. */
export type TheBriefImportState = 'ready' | 'attention' | 'invalid' | 'importing' | 'saved' | 'failed'

export interface TheBriefImportResult {
  state: Extract<TheBriefImportState, 'importing' | 'saved' | 'failed' | 'attention'>
  message: string
}

export interface TheBriefImportRow {
  file: File
  /** Absent when the package failed validation; such rows are never imported. */
  pkg?: TheBriefPackage
  invalidReason?: string
  clientId: string
  folderId: string
  sourceCreatedDate: string
  result?: TheBriefImportResult
  projectId?: string
}

export interface TheBriefLibraryProject {
  id: string
  clientId: string | null
  tags?: string[]
  canvasData?: Record<string, unknown> | null
}

export const UNASSIGNED_CLIENT = '__unassigned__'
export const UNFILED_FOLDER = '__unfiled__'

function describeInvalid(cause: unknown): string {
  if (cause instanceof SyntaxError) return 'Not a readable JSON package'
  if (cause instanceof ZodError) {
    const issue = cause.issues[0]
    return issue ? `Package format: ${issue.path.join('.') || 'package'} ${issue.message}` : 'Package format is not supported'
  }
  return cause instanceof Error ? cause.message : 'Could not read import package'
}

export async function readImportBatch(files: File[], previous: TheBriefImportRow[], clients: Array<{ id: string, name: string }>, folders: BannerFolder[] = []): Promise<TheBriefImportRow[]> {
  if (files.length > 50) throw new Error('Choose up to 50 prepared packages at a time.')
  const rows: TheBriefImportRow[] = []
  for (const file of files) {
    // File identity is deliberate: a newly selected file with the same name or
    // source hash must be validated again before it can inherit any outcome.
    const existing = previous.find(row => row.file === file)
    if (existing) {
      rows.push(existing)
      continue
    }
    // Each package is validated on its own; one invalid file never blocks the others.
    try {
      if (file.size > 45 * 1024 * 1024) throw new Error(`${file.name} exceeds the 45 MB package limit`)
      const pkg = parseTheBriefPackage(JSON.parse(await file.text()))
      for (const asset of [...pkg.assets, ...pkg.fonts]) await packageFile(asset)
      rows.push({ file, pkg, clientId: clientFromHint(pkg.source.clientName, clients) || suggestImportClient(pkg.name, clients) || UNASSIGNED_CLIENT, folderId: bannerFolderForSource(folders, pkg.source.folder) || UNFILED_FOLDER, sourceCreatedDate: pkg.source.createdDate || '' })
    } catch (cause) {
      rows.push({ file, invalidReason: describeInvalid(cause), clientId: UNASSIGNED_CLIENT, folderId: UNFILED_FOLDER, sourceCreatedDate: '' })
    }
  }
  return rows
}

/** Current state of every row, in selection order. Pure, so the dialog can recompute it on any edit. */
export function importRowStates(rows: TheBriefImportRow[], { importUndated = false } = {}): Array<{ state: TheBriefImportState, message: string }> {
  const claimed = new Set<string>()
  return rows.map((row) => {
    if (!row.pkg) return { state: 'invalid', message: row.invalidReason || 'Invalid package' }
    if (row.result) return row.result
    if (row.clientId === UNASSIGNED_CLIENT) return { state: 'attention', message: 'Choose the client before importing' }
    // One TheBrief design is one draft per client: a second package for it in this batch waits.
    const identity = `${row.clientId}:${row.pkg.source.designHash.toLowerCase()}`
    if (claimed.has(identity)) return { state: 'attention', message: 'Another package in this batch is the same TheBrief design for this client' }
    claimed.add(identity)
    if (!row.sourceCreatedDate && !importUndated) return { state: 'attention', message: 'Verify the original creation date in TheBrief before importing' }
    return { state: 'ready', message: row.sourceCreatedDate ? 'Ready for draft import' : 'Ready · creation date pending backfill' }
  })
}

/**
 * Marks rows already saved in the banner library, so progress survives a closed tab or another
 * browser. Matching mirrors the server: client plus source checksum, or client plus design when
 * every prepared size is already in that draft.
 */
export function reconcileImportRows(rows: TheBriefImportRow[], library: TheBriefLibraryProject[]): void {
  for (const row of rows) {
    if (!row.pkg || row.clientId === UNASSIGNED_CLIENT || (row.result && row.result.state !== 'failed')) continue
    const owned = library.filter(project => project.clientId === row.clientId && project.tags?.includes('source:thebrief'))
    const sameExport = owned.find(project => project.tags?.some(tag => tag.toLowerCase() === `source-sha256:${row.pkg!.source.sha256}`))
    if (sameExport) {
      row.projectId = sameExport.id
      row.result = { state: 'saved', message: 'Already imported · open for review or explicitly update this draft' }
      continue
    }
    const designTag = `source-design:${row.pkg.source.designHash.toLowerCase()}`
    const sameDesign = owned.find(project => project.tags?.some(tag => tag.toLowerCase() === designTag))
    if (!sameDesign) continue
    row.projectId = sameDesign.id
    const savedSizes = Object.keys(sameDesign.canvasData || {})
    const missing = Object.keys(row.pkg.canvasData).filter(size => !savedSizes.includes(size))
    row.result = missing.length
      ? { state: 'attention', message: `Already imported from this TheBrief design without ${missing.map(size => size.replace('custom_', '')).join(', ')} · use Update imported draft to replace its sizes` }
      : { state: 'saved', message: 'Already imported from this TheBrief design · open for review or explicitly update this draft' }
  }
}

export function summariseImport(states: Array<{ state: TheBriefImportState }>): Record<TheBriefImportState, number> {
  const counts = { ready: 0, attention: 0, invalid: 0, importing: 0, saved: 0, failed: 0 }
  for (const { state } of states) counts[state]++
  return counts
}
