import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

async function filesIn(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesIn(file))
    else if (entry.isFile()) files.push(file)
  }
  return files
}
export async function checkEmailRenderingArtifacts(pagesDirectory, workerDirectory) {
  const pages = (await filesIn(pagesDirectory)).filter(file => /\.(?:m?js|map)$/.test(file))
  assert(pages.some(file => /\.(?:m?js)$/.test(file)), 'Missing Pages modules')
  for (const file of pages) {
    const source = await readFile(file, 'utf8')
    assert(!/__emailWorkerBlockRegistry|__edmBlockRegistry/.test(source), `Renderer implementation retained in Pages: ${file}`)
    if (file.endsWith('.map')) {
      const map = JSON.parse(source)
      assert(!(map.sources ?? []).some(name => /workers\/email-rendering\/src\/|email-marketing\/render\/(?:blocks\/|flyhub-html-renderer|block-registry)|pageStudio\/emailTemplatePreview/.test(name)), `Renderer source retained in Pages graph: ${file}`)
    }
  }
  const worker = await readFile(path.join(workerDirectory, 'index.js'), 'utf8')
  assert(worker.includes('__emailWorkerBlockRegistry'), 'Missing renderer in private Worker')
  assert(!/(?:from\s*|import\s*\()(['"])node:/.test(worker), 'Node runtime dependency in renderer')
  const map = JSON.parse(await readFile(path.join(workerDirectory, 'index.js.map'), 'utf8'))
  assert(Array.isArray(map.sources) && map.sources.length > 0, 'Missing private Worker module graph')
  for (const name of map.sources) {
    assert(!/(?:^|\/)server\/|(?:^|\/)(?:postgres|resend|pg)\//.test(name), `Privileged dependency in renderer: ${name}`)
  }
  return { pagesFiles: pages.length, workerSources: map.sources.length }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkEmailRenderingArtifacts(path.resolve('dist/_worker.js'), path.resolve('.verification/email-rendering-worker-staging'))
  console.log(`[email-rendering-artifacts] ${JSON.stringify(result)}`)
}
