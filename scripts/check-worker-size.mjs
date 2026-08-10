import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const MIB = 1024 * 1024
const workerDir = path.resolve('dist/_worker.js')
// Cloudflare's hard cap is 25,000,000 bytes. The release budget keeps a
// safety margin under it; trimmed 250 KB → 240 KB on 2026-08-10 when organic
// growth put main ~1 KB over the old budget. If this trips again, stop
// adjusting the margin — the worker is at the ceiling and server
// functionality must move to a standalone Worker.
const RELEASE_BUDGET_BYTES = 24_760_000

async function deployedBytes(directory) {
  let total = 0

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.endsWith('.map') || entry.name.startsWith('wrangler.')) continue

    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      total += await deployedBytes(absolutePath)
    } else if (entry.isFile()) {
      total += (await stat(absolutePath)).size
    }
  }

  return total
}

const bytes = await deployedBytes(workerDir)
const remaining = RELEASE_BUDGET_BYTES - bytes
const format = value => `${(value / MIB).toFixed(2)} MiB`

console.log(
  `[worker-size] ${format(bytes)} / ${format(RELEASE_BUDGET_BYTES)} `
  + `(${format(remaining)} remaining)`
)

if (remaining < 0) {
  throw new Error(
    `Worker exceeds the ${format(RELEASE_BUDGET_BYTES)} release budget by `
    + `${format(Math.abs(remaining))}. `
    + 'Move server functionality to a standalone Worker before deploying Pages.'
  )
}
