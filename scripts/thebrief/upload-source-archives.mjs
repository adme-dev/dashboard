#!/usr/bin/env node
// Uploads every original TheBrief per-size child ZIP from the migration workspace
// to private Banner Studio source-archive storage, with its design, client and
// project links. Resumable: completed SHA-256s in the receipt log are skipped and
// the server is idempotent by SHA-256.
//
// Read-only on the workspace except for appending ledger/r2-archive-log.jsonl.
// Child ZIPs are read from the bulk export in memory; nothing is extracted.
//
// Usage:
//   node scripts/thebrief/upload-source-archives.mjs [--dry-run] [--workspace <dir>] [--only <folder>]
// Auth (the signed-in user's own session; never printed):
//   XEROFLOW_AUTH_TOKEN=<session token>  or  XEROFLOW_COOKIE="auth_token=..."
//   XEROFLOW_BASE_URL (default https://app.xeroflow.io)

import { createHash } from 'node:crypto'
import { appendFile, readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { unzipSync } from 'fflate'

const MAX_BYTES = 64 * 1024 * 1024
const ROUTE = '/api/agency/banner-studio/source-archives'
const CLIENT_STATUSES = new Set(['exact', 'confirmed'])
const CHILD_ENTRY = /^General usage\/([^/]+-(\d{1,5})x(\d{1,5})-px(?:-\d{1,3})?\.zip)$/
const DESIGN_HASH = /^[0-9a-z]{4,32}$/

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function parseArgs(argv) {
  const args = { dryRun: false, workspace: join(homedir(), 'Documents/XeroFlow Imports/TheBrief Migration'), only: null }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--dry-run') args.dryRun = true
    else if (value === '--workspace') args.workspace = argv[++index]
    else if (value === '--only') args.only = argv[++index]
    else throw new Error(`Unknown argument: ${value}`)
  }
  return args
}

async function readJsonl(path) {
  try {
    return (await readFile(path, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

function holdReason(entry) {
  const reasons = (entry.blockers ?? [])
    .map(blocker => [blocker.archive, blocker.error || blocker.reason || blocker.diagError].filter(Boolean).join(': '))
    .filter(Boolean)
  return reasons.length ? [...new Set(reasons)].join('; ').slice(0, 2000) : null
}

/** Joins the ledgers into lookups keyed by child SHA-256, design hash and client name. */
export function buildIndex({ prepareLog, importLog, clientDecisions, clients, crawl }) {
  const bySha = new Map()
  for (const entry of [...prepareLog].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    for (const archive of entry.archives ?? []) {
      bySha.set(archive.sha256, { entry, childHash: archive.childHash ?? null })
    }
  }

  const projects = new Map()
  for (const entry of importLog) {
    if (entry.designHash && entry.projectId) projects.set(entry.designHash, entry.projectId)
  }

  const clientIds = new Map()
  for (const client of clients) {
    const name = client.name?.trim().toLowerCase()
    if (!name) continue
    clientIds.set(name, clientIds.has(name) ? null : client.id)
  }

  const childToParent = new Map()
  const folderOf = new Map()
  for (const folder of Object.values(crawl?.done ?? {})) {
    const path = (folder.path ?? []).join('/')
    for (const design of folder.designs ?? []) {
      folderOf.set(design.hash, path)
      childToParent.set(design.hash, childToParent.get(design.hash) ?? design.hash)
      for (const child of design.children ?? []) childToParent.set(child.hash, design.hash)
    }
  }

  function client(designHash) {
    const decision = clientDecisions[designHash]
    if (!decision || !CLIENT_STATUSES.has(decision.status) || !decision.client) return { clientId: null, clientName: null }
    const id = clientIds.get(decision.client.trim().toLowerCase())
    return id ? { clientId: id, clientName: decision.client } : { clientId: null, clientName: null }
  }

  return { bySha, projects, client, childToParent, folderOf }
}

/** Parent design for a child ZIP absent from the prepare log, from hashes embedded in its index.html. */
export function resolveByEmbeddedHash(childBytes, index) {
  let html
  try {
    const files = unzipSync(childBytes, { filter: file => file.name === 'index.html' })
    html = files['index.html'] ? new TextDecoder().decode(files['index.html']) : ''
  } catch {
    return null
  }
  const hits = new Set((html.match(/\b[0-9a-z]{7}\b/g) ?? []).filter(hash => index.childToParent.has(hash)))
  const parents = new Set([...hits].map(hash => index.childToParent.get(hash)))
  if (parents.size !== 1) return null
  const designHash = [...parents][0]
  const childHash = [...hits].find(hash => hash !== designHash) ?? designHash
  return { designHash, childHash }
}

/** Metadata the upload route needs for one child ZIP. */
export function describeChild({ sha, bytes, entryName, batchSha256, folder, childBytes }, index) {
  const match = CHILD_ENTRY.exec(entryName)
  if (!match) return { error: 'Not a General usage size ZIP' }
  const [, filename, width, height] = match
  const mapped = index.bySha.get(sha)
  let designHash
  let childHash
  let status
  let reason
  let folderPath

  if (mapped) {
    designHash = mapped.entry.designHash
    childHash = mapped.childHash
    folderPath = mapped.entry.folderPath ?? folder
    status = mapped.entry.status === 'held' ? 'held' : 'pending'
    reason = status === 'held' ? holdReason(mapped.entry) : null
  } else {
    const resolved = resolveByEmbeddedHash(childBytes, index)
    if (!resolved) return { error: 'Parent design unresolved: not in prepare log and embedded hash matched no unique crawled design' }
    designHash = resolved.designHash
    childHash = resolved.childHash
    folderPath = index.folderOf.get(designHash) || folder
    status = 'held'
    reason = 'Not prepared: absent from prepare-log (design moved, renamed or matched ambiguously at batch time); parent resolved from embedded TheBrief hash'
  }
  if (!DESIGN_HASH.test(designHash ?? '')) return { error: 'Invalid design hash' }

  const { clientId, clientName } = index.client(designHash)
  const projectId = index.projects.get(designHash) ?? null
  if (projectId && clientId) status = 'imported'

  return {
    metadata: {
      sha256: sha,
      bytes: String(bytes),
      designHash,
      ...(childHash && DESIGN_HASH.test(childHash) ? { childHash } : {}),
      filename,
      ...(folderPath ? { folderPath } : {}),
      sizeLabel: `${Number(width)}x${Number(height)}`,
      batchSha256,
      ...(clientId ? { clientId } : {}),
      ...(status === 'imported' ? { projectId } : {}),
      status,
      ...(reason ? { holdReason: reason } : {})
    },
    clientName,
    projectId
  }
}

function authHeaders(env) {
  const token = env.XEROFLOW_AUTH_TOKEN?.trim()
  const cookie = env.XEROFLOW_COOKIE?.trim()
  if (token) return { authorization: `Bearer ${token}` }
  if (cookie) return { cookie }
  throw new Error('Set XEROFLOW_AUTH_TOKEN or XEROFLOW_COOKIE to your own signed-in session (it is never printed).')
}

async function errorText(response) {
  const text = await response.text().catch(() => '')
  try {
    const body = JSON.parse(text)
    return `${response.status} ${body.statusMessage || body.message || ''}`.trim()
  } catch {
    return `${response.status} ${text.slice(0, 200)}`.trim()
  }
}

async function findExisting(baseUrl, headers, metadata) {
  const url = new URL(ROUTE, baseUrl)
  url.searchParams.set('sha256', metadata.sha256)
  url.searchParams.set('clientId', metadata.clientId ?? 'unassigned')
  const response = await fetch(url, { headers: { ...headers, accept: 'application/json' } })
  if (!response.ok) return null
  const body = await response.json()
  return body.archives?.find(archive => archive.sha256 === metadata.sha256) ?? null
}

async function upload(baseUrl, headers, metadata, bytes) {
  const existing = await findExisting(baseUrl, headers, metadata)
  if (existing) return { archive: existing, alreadyPresent: true }
  const url = new URL(ROUTE, baseUrl)
  for (const [key, value] of Object.entries(metadata)) url.searchParams.set(key, value)
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'accept': 'application/json', 'content-type': 'application/zip' },
    body: bytes
  })
  if (!response.ok) throw new Error(await errorText(response))
  return response.json()
}

async function batches(workspace, only) {
  const root = join(workspace, 'archives')
  const found = []
  for (const folder of (await readdir(root)).sort()) {
    if (only && folder !== only) continue
    const folderDir = join(root, folder)
    if (!(await stat(folderDir)).isDirectory()) continue
    for (const batch of (await readdir(folderDir)).sort()) {
      const dir = join(folderDir, batch)
      if (!(await stat(dir)).isDirectory()) continue
      for (const file of (await readdir(dir)).sort()) {
        if (file.endsWith('.zip')) found.push({ folder, path: join(dir, file) })
      }
    }
  }
  return found
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv)
  const workspace = args.workspace
  const logPath = join(workspace, 'ledger/r2-archive-log.jsonl')
  const headers = args.dryRun ? {} : authHeaders(env)
  const baseUrl = env.XEROFLOW_BASE_URL?.trim() || 'https://app.xeroflow.io'

  const index = buildIndex({
    prepareLog: await readJsonl(join(workspace, 'ledger/prepare-log.jsonl')),
    importLog: await readJsonl(join(workspace, 'ledger/import-log.jsonl')),
    clientDecisions: JSON.parse(await readFile(join(workspace, 'ledger/clients.json'), 'utf8')),
    clients: JSON.parse(await readFile(join(workspace, 'inventory/xeroflow-clients-2026-10-31.json'), 'utf8')).clients ?? [],
    crawl: JSON.parse(await readFile(join(workspace, 'inventory/thebrief-crawl-checkpoint.json'), 'utf8'))
  })
  const done = new Set((await readJsonl(logPath))
    .filter(line => line.result === 'uploaded' || line.result === 'already-present')
    .map(line => line.sha256))

  const counts = { uploaded: 0, alreadyPresent: 0, skippedFromLog: 0, failed: 0, unassignedClient: 0, planned: 0 }
  const receipt = async (line) => {
    if (!args.dryRun) await appendFile(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...line })}\n`)
  }

  for (const batch of await batches(workspace, args.only)) {
    const container = await readFile(batch.path)
    const batchSha256 = sha256(container)
    const recorded = (await readFile(`${batch.path}.sha256`, 'utf8').catch(() => '')).trim().split(/\s+/)[0]
    const batchRef = relative(workspace, batch.path)
    if (recorded !== batchSha256) {
      counts.failed += 1
      await receipt({ batch: batchRef, batchSha256, result: 'failed', error: 'Batch SHA-256 does not match its .sha256 file' })
      console.error(`FAIL ${batchRef}: batch SHA-256 mismatch`)
      continue
    }

    const names = []
    unzipSync(container, { filter: (file) => {
      names.push(file.name)
      return false
    } })
    for (const entryName of names.sort()) {
      if (entryName.endsWith('/')) continue
      const childBytes = unzipSync(container, { filter: file => file.name === entryName })[entryName]
      const sha = sha256(childBytes)
      const base = { batch: batchRef, batchSha256, entry: entryName, sha256: sha, bytes: childBytes.byteLength }
      if (done.has(sha)) {
        counts.skippedFromLog += 1
        continue
      }
      if (childBytes.byteLength > MAX_BYTES) {
        counts.failed += 1
        await receipt({ ...base, result: 'failed', error: 'Child ZIP exceeds 64 MB' })
        continue
      }
      const described = describeChild({ sha, bytes: childBytes.byteLength, entryName, batchSha256, folder: batch.folder, childBytes }, index)
      if (described.error) {
        counts.failed += 1
        await receipt({ ...base, result: 'failed', error: described.error })
        console.error(`FAIL ${basename(entryName)}: ${described.error}`)
        continue
      }
      const { metadata, clientName } = described
      if (!metadata.clientId) counts.unassignedClient += 1
      const summary = {
        ...base,
        designHash: metadata.designHash,
        childHash: metadata.childHash ?? null,
        sizeLabel: metadata.sizeLabel,
        folderPath: metadata.folderPath ?? null,
        clientId: metadata.clientId ?? null,
        clientName,
        projectId: metadata.projectId ?? null,
        status: metadata.status
      }
      if (args.dryRun) {
        counts.planned += 1
        console.log(`PLAN ${metadata.status.padEnd(8)} ${metadata.designHash} ${metadata.sizeLabel.padEnd(9)} ${clientName ?? 'unassigned'}`)
        continue
      }
      try {
        const result = await upload(baseUrl, headers, metadata, childBytes)
        const outcome = result.alreadyPresent ? 'already-present' : 'uploaded'
        counts[result.alreadyPresent ? 'alreadyPresent' : 'uploaded'] += 1
        done.add(sha)
        await receipt({ ...summary, result: outcome, archiveId: result.archive?.id, r2Key: result.archive?.r2Key })
        console.log(`${outcome.toUpperCase()} ${metadata.designHash} ${metadata.sizeLabel}`)
      } catch (error) {
        counts.failed += 1
        await receipt({ ...summary, result: 'failed', error: String(error.message ?? error).slice(0, 500) })
        console.error(`FAIL ${metadata.designHash} ${metadata.sizeLabel}: ${error.message ?? error}`)
      }
    }
  }

  console.log(JSON.stringify(counts))
  return counts
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((counts) => {
    process.exitCode = counts.failed ? 1 : 0
  }).catch((error) => {
    console.error(error.message ?? error)
    process.exitCode = 1
  })
}
