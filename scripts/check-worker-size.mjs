import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const MIB = 1024 * 1024
const workerDir = path.resolve('dist/_worker.js')
const maxBytes = Number(process.env.WORKER_SIZE_BUDGET_BYTES || 24.5 * MIB)

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
const remaining = maxBytes - bytes
const format = value => `${(value / MIB).toFixed(2)} MiB`

console.log(`[worker-size] ${format(bytes)} / ${format(maxBytes)} (${format(remaining)} remaining)`)

if (remaining < 0) {
  throw new Error(
    `Worker exceeds the ${format(maxBytes)} release budget by ${format(Math.abs(remaining))}. ` +
    'Move server functionality to a standalone Worker before deploying Pages.'
  )
}
