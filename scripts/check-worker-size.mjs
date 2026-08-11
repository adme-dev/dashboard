import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { constants, gzipSync } from 'node:zlib'

const workerDir = path.resolve('dist/_worker.js')
// Pages currently enforces a 25 MiB uncompressed Functions upload limit even
// when the account has the broader Workers Paid limits. Keep a 256 KiB margin
// so a locally accepted artifact cannot be rejected at the Pages API boundary.
// https://developers.cloudflare.com/pages/functions/
const RAW_RELEASE_BUDGET_BYTES = 25 * 1024 * 1024 - 256 * 1024
const GZIP_RELEASE_BUDGET_BYTES = 9_750_000

async function deployedBytes(directory) {
  let raw = 0
  let gzip = 0

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.endsWith('.map') || entry.name.startsWith('wrangler.')) continue

    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await deployedBytes(absolutePath)
      raw += nested.raw
      gzip += nested.gzip
    } else if (entry.isFile()) {
      const contents = await readFile(absolutePath)
      raw += contents.byteLength
      gzip += gzipSync(contents, { level: constants.Z_BEST_COMPRESSION }).byteLength
    }
  }

  return { raw, gzip }
}

const bytes = await deployedBytes(workerDir)
const rawRemaining = RAW_RELEASE_BUDGET_BYTES - bytes.raw
const gzipRemaining = GZIP_RELEASE_BUDGET_BYTES - bytes.gzip
const margin = remaining => remaining >= 0
  ? `${remaining} remaining`
  : `${Math.abs(remaining)} over`
const summary = `raw ${bytes.raw} / ${RAW_RELEASE_BUDGET_BYTES} bytes (${margin(rawRemaining)}); `
  + `gzip ${bytes.gzip} / ${GZIP_RELEASE_BUDGET_BYTES} bytes (${margin(gzipRemaining)})`

console.log(`[worker-size] ${summary}`)

if (rawRemaining < 0 || gzipRemaining < 0) {
  throw new Error(
    `Worker exceeds the immutable Cloudflare Pages safety budget: ${summary}. `
    + 'Move server functionality to a standalone Worker before deploying Pages.'
  )
}
