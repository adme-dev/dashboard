import { packageFile, parseTheBriefPackage, suggestImportClient, type TheBriefPackage } from './thebrief-import'

export interface TheBriefImportRow {
  file: File
  pkg: TheBriefPackage
  clientId: string
  status: string
  projectId?: string
}

export async function readImportBatch(files: File[], previous: TheBriefImportRow[], clients: Array<{ id: string, name: string }>): Promise<TheBriefImportRow[]> {
  if (files.length > 10) throw new Error('Choose up to 10 prepared packages at a time.')
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
    rows.push({ file, pkg, clientId: suggestImportClient(pkg.name, clients) || '__unassigned__', status: 'Ready for draft import' })
  }
  return rows
}
