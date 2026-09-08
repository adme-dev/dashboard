import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const workerRoot = path.resolve(process.argv[2] || 'dist/_worker.js')
const outputPath = path.resolve(process.argv[3] || 'docs/architecture/page-studio-pages-size-inventory.md')

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(absolute))
    else if (entry.isFile() && !entry.name.endsWith('.map')) files.push(absolute)
  }
  return files
}

const files = await filesUnder(workerRoot)
const rows = (await Promise.all(files.map(async file => {
  const contents = await readFile(file)
  return {
  bytes: contents.byteLength,
  containsPageStudio: /page[-_. ]?studio|provisioning|booking/i.test(contents.toString('utf8')),
  path: path.relative(workerRoot, file).split(path.sep).join('/')
  }
}))).sort((left, right) => right.bytes - left.bytes)

const pageStudioRoutes = rows.filter(row => row.containsPageStudio && row.path.startsWith('chunks/')).slice(0, 30)
const sharedModules = rows.filter(row => row.path.startsWith('chunks/m/')).slice(0, 15)
const formatBytes = bytes => `${(bytes / 1024).toFixed(1)} KiB`
const list = values => values.length ? values.map(row => `- \`${row.path}\` — ${formatBytes(row.bytes)}`).join('\n') : '- None found'

const report = `# Page Studio Pages size inventory\n\nGenerated from \`${path.relative(process.cwd(), workerRoot)}\`. Source maps are excluded, matching the release guard.\n\n## Largest chunks containing Page Studio or booking references\n\n${list(pageStudioRoutes)}\n\n## Largest shared modules\n\n${list(sharedModules)}\n\n## Interpretation\n\nThe wrapped artifact does not retain stable source route names, so the first list is a content-reference signal rather than an exact route-size attribution. The dominant raw weight is shared \`chunks/m/*\` runtime code. Extraction should target dependencies reachable from those shared modules and preserve the existing service-binding and scope contracts. Re-run this inventory after each extraction and require the guarded size check to pass with its configured margin.\n`
await writeFile(outputPath, report)
process.stdout.write(`Wrote ${path.relative(process.cwd(), outputPath)}\n`)
