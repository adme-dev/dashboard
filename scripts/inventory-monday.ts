#!/usr/bin/env node

import { access, link, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  buildMondayInventoryManifest,
  redactMondayInventoryError,
  serializeMondayInventoryManifest,
  type MondayInventoryManifest,
} from '../server/utils/mondayInventory'
import { MondayGraphqlInventorySource } from '../server/utils/mondayInventorySource'

const EXPECTED_ACCOUNT_ID = '229224'

function help(): string {
  return `Monday -> XeroFlow M1 read-only inventory

Usage:
  node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/inventory-monday.ts \\
    --dry-run --output /private/tmp/adme-monday-inventory.json

Options:
  --dry-run              Required safety acknowledgement; this command never mutates Monday or XeroFlow
  --output <path>        Required explicit local/private JSON output path
  --resume <path>        Resume an incomplete manifest from its recorded checkpoints
  --observed-at <ISO>    Fixed observation time (defaults to now; resume reuses the original)
  --page-size <1..500>   Provider page size (default 100)
  --help                 Show this help

The output contains no OAuth token or raw secret. A complete manifest is canonical JSON with a SHA-256 checksum.
`
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

async function assertOutputDoesNotExist(outputPath: string): Promise<void> {
  try {
    await access(outputPath)
    throw new Error(`Refusing to overwrite existing output: ${outputPath}`)
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }
}

export async function writeManifestExclusive(outputPath: string, contents: string, suffix: string): Promise<void> {
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'manifest'
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${safeSuffix}`
  let temporaryCreated = false
  try {
    await writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    temporaryCreated = true
    await link(temporaryPath, outputPath)
  } catch (error: any) {
    if (error?.code === 'EEXIST' && !temporaryCreated) throw new Error(`Temporary inventory output already exists: ${temporaryPath}`)
    if (error?.code === 'EEXIST') throw new Error(`Inventory output already exists: ${outputPath}`)
    throw error
  } finally {
    if (temporaryCreated) await rm(temporaryPath, { force: true })
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    process.stdout.write(help())
    return
  }
  if (!args.includes('--dry-run')) throw new Error('Refusing to run without --dry-run')
  const outputArg = valueAfter(args, '--output')
  if (!outputArg || outputArg.startsWith('-')) throw new Error('--output requires an explicit local/private path')
  const outputPath = resolve(outputArg)
  await assertOutputDoesNotExist(outputPath)
  const token = process.env.MONDAY_API_TOKEN
  if (!token) throw new Error('MONDAY_API_TOKEN is not configured')

  const resumeArg = valueAfter(args, '--resume')
  const resume = resumeArg
    ? JSON.parse(await readFile(resolve(resumeArg), 'utf8')) as MondayInventoryManifest
    : undefined
  const pageSizeArg = valueAfter(args, '--page-size')
  const pageSize = pageSizeArg ? Number(pageSizeArg) : 100
  const observedAt = valueAfter(args, '--observed-at') || resume?.observedAt || new Date().toISOString()
  const source = new MondayGraphqlInventorySource(token)
  const manifest = await buildMondayInventoryManifest(source, {
    expectedAccountId: EXPECTED_ACCOUNT_ID,
    observedAt,
    pageSize,
    resume,
    redactValues: [token],
  })

  await writeManifestExclusive(outputPath, serializeMondayInventoryManifest(manifest), manifest.checksumSha256)
  process.stdout.write(`Monday inventory ${manifest.completeness.verdict}: ${outputPath}\n`)
  process.stdout.write(`SHA-256: ${manifest.checksumSha256}\n`)
  if (manifest.completeness.verdict !== 'complete') process.exitCode = 2
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const token = process.env.MONDAY_API_TOKEN
    process.stderr.write(`Monday inventory failed: ${redactMondayInventoryError(error, token ? [token] : [])}\n`)
    process.exitCode = 1
  })
}
