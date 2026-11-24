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

export interface TheBriefArchiveResult {
  sourceSha256: string
  packages: unknown[]
  issues: Array<{ name: string, message: string, sizes: number }>
}
interface BatchPreparation {
  prepareZip?: (file: File) => Promise<TheBriefArchiveResult>
  cache?: WeakMap<File, TheBriefArchiveResult>
  onArchive?: (file: File, result: TheBriefArchiveResult) => void
}

export async function readImportBatch(files: File[], previous: TheBriefImportRow[], clients: Array<{ id: string, name: string }>, folders: BannerFolder[] = [], preparation: BatchPreparation = {}): Promise<TheBriefImportRow[]> {
  if (files.reduce((sum, file) => sum + file.size, 0) > 128 * 1024 * 1024) throw new Error('Choose a smaller batch: prepared packages exceed 128 MB in total.')
  if (files.length > 50) throw new Error('Choose up to 50 prepared packages at a time.')
  const rows: TheBriefImportRow[] = []
  let preparedBytes = 0
  for (const file of files) {
    // File identity is deliberate: a newly selected file with the same name or
    // source hash must be validated again before it can inherit any outcome.
    if (file.size > 85 * 1024 * 1024) throw new Error(`${file.name} exceeds the 85 MB package limit`)
    // Detect the actual bytes as well as the extension: the picker can receive
    // dragged ZIPs and renamed exports. Never decode a source archive as JSON.
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    let packages: TheBriefPackage[]
    if (/\.zip$/i.test(file.name) || (signature[0] === 0x50 && signature[1] === 0x4b)) {
      if (file.size > 64 * 1024 * 1024) throw new Error(`${file.name} exceeds the 64 MB ZIP limit`)
      if (!preparation.prepareZip) throw new Error(`${file.name} is a ZIP export. Prepare its designs as .xeroflow.json packages first, then select all the prepared packages together to import the group. Keep every design's sizes together in one package.`)
      let result = preparation.cache?.get(file)
      if (!result) {
        result = await preparation.prepareZip(file)
        if (!result || !Array.isArray(result.packages) || result.packages.length > 50 || !Array.isArray(result.issues) || result.issues.length > 50 || result.issues.some(issue => typeof issue.name !== 'string' || typeof issue.message !== 'string' || !Number.isInteger(issue.sizes))) throw new Error('Invalid ZIP preparation response')
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('')
        if (result.sourceSha256 !== digest) throw new Error('Prepared designs do not match the selected ZIP; select the source again')
        preparation.cache?.set(file, result)
      }
      packages = result.packages.map(parseTheBriefPackage)
      preparation.onArchive?.(file, result)
    } else {
      const existing = previous.find(row => row.file === file)
      if (existing) {
        preparedBytes += file.size
        rows.push(existing)
        continue
      }
      let input: unknown
      try {
        input = JSON.parse(await file.text())
      } catch {
        throw new Error(`${file.name} is not a valid prepared JSON package. Choose .xeroflow.json files; you can select several designs together.`)
      }
      packages = [parseTheBriefPackage(input)]
    }
    for (const pkg of packages) {
      preparedBytes += new TextEncoder().encode(JSON.stringify(pkg)).length
      if (preparedBytes > 128 * 1024 * 1024) throw new Error('Choose a smaller batch: prepared designs exceed 128 MB in total.')
      if (rows.length >= 50) throw new Error('Choose up to 50 designs at a time.')
      const existing = previous.find(row => row.file === file && row.pkg.source.sha256 === pkg.source.sha256)
      if (existing) {
        rows.push(existing)
        continue
      }
      for (const asset of [...pkg.assets, ...pkg.fonts]) await packageFile(asset)
      rows.push({ file, pkg, clientId: clientFromHint(pkg.source.clientName, clients) || suggestImportClient(pkg.name, clients) || '__unassigned__', folderId: bannerFolderForSource(folders, pkg.source.folder) || '__unfiled__', sourceCreatedDate: pkg.source.createdDate || '', status: 'Ready for draft import' })
    }
  }
  if (preparedBytes > 128 * 1024 * 1024) throw new Error('Choose a smaller batch: prepared designs exceed 128 MB in total.')
  if (rows.length > 50) throw new Error('Choose up to 50 designs at a time.')
  return rows
}
