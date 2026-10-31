import { clientFromHint, packageFile, parseTheBriefPackage, suggestImportClient, type TheBriefPackage } from './thebrief-import'
import { bannerFolderForSource } from './banner-folders'
import type { BannerFolder } from '~/types/banner-studio'

export interface TheBriefImportRow {
  file: File
  pkg: TheBriefPackage
  clientId: string
  folderId: string
  sourceCreatedDate: string
  status: string
  projectId?: string
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
    if (file.size > 45 * 1024 * 1024) throw new Error(`${file.name} exceeds the 45 MB package limit`)
    const pkg = parseTheBriefPackage(JSON.parse(await file.text()))
    for (const asset of [...pkg.assets, ...pkg.fonts]) await packageFile(asset)
    rows.push({ file, pkg, clientId: clientFromHint(pkg.source.clientName, clients) || suggestImportClient(pkg.name, clients) || '__unassigned__', folderId: bannerFolderForSource(folders, pkg.source.folder) || '__unfiled__', sourceCreatedDate: pkg.source.createdDate || '', status: 'Ready for draft import' })
  }
  return rows
}
