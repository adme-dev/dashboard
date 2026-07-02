#!/usr/bin/env node
/**
 * One-shot bootstrap: uploads local graphify-out artifacts to R2 so the
 * dashboard can read them before the GitHub Action takes over.
 *
 * Usage (Node 20.6+ for --env-file):
 *   node --env-file=.env scripts/upload-graphify.mjs <local-path> <r2-prefix> [--full]
 *
 * Example:
 *   node --env-file=.env scripts/upload-graphify.mjs \
 *     /Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/graphify-out \
 *     graphify/promotion-knoxgwmhaval
 *
 * The r2-prefix becomes the project_repos.graphify_path value.
 * Default uploads only the primary architecture contract files that the
 * dashboard reads. Pass --full to include wiki/ and obsidian/ for human review.
 * The cache/ subfolder is always skipped.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { promises as fs } from 'node:fs'
import { join, relative, basename } from 'node:path'

const PRIMARY_FILES = new Set(['.graphify_python', 'graph.json', 'GRAPH_REPORT.md', 'index.md', 'log.md'])

function contentTypeFor(filename) {
  if (filename.endsWith('.json')) return 'application/json'
  if (filename.endsWith('.md')) return 'text/markdown; charset=utf-8'
  if (filename.endsWith('.html')) return 'text/html; charset=utf-8'
  return 'application/octet-stream'
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'cache') continue
      yield* walk(full)
    } else if (entry.isFile()) {
      yield full
    }
  }
}

async function main() {
  const [, , localPath, r2Prefix, ...options] = process.argv
  if (!localPath || !r2Prefix) {
    console.error('Usage: node --env-file=.env scripts/upload-graphify.mjs <local-path> <r2-prefix> [--full]')
    process.exit(1)
  }

  const fullUpload = options.includes('--full') || process.env.GRAPHIFY_UPLOAD_FULL === '1'

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME || 'agency-files'

  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.error('Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in env')
    process.exit(1)
  }

  const stat = await fs.stat(localPath)
  if (!stat.isDirectory()) {
    console.error(`Not a directory: ${localPath}`)
    process.exit(1)
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  const prefix = r2Prefix.replace(/\/+$/, '')
  let count = 0
  let bytes = 0

  for await (const file of walk(localPath)) {
    const rel = relative(localPath, file)
    if (!fullUpload && !PRIMARY_FILES.has(rel)) continue

    const key = `${prefix}/${rel}`
    const body = await fs.readFile(file)
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentTypeFor(basename(file)),
      }),
    )
    count += 1
    bytes += body.length
    process.stdout.write(`  ${key}  (${body.length.toLocaleString()} bytes)\n`)
  }

  console.log(
    `\nUploaded ${count} files (${(bytes / 1024 / 1024).toFixed(2)} MB) to r2://${bucket}/${prefix}/`,
  )
  console.log(`Upload scope: ${fullUpload ? 'full graphify-out vault' : 'primary architecture artifacts'}`)
  console.log(`\nUse this as graphify_path when connecting the repo: ${prefix}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
