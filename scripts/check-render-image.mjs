import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export function renderContextHash(directory) {
  const hash = createHash('sha256')
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const full = resolve(path, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (entry.isFile()) {
        hash.update(relative(directory, full).replaceAll('\\', '/') + '\0')
        hash.update(readFileSync(full))
        hash.update('\0')
      } else throw new Error('Render context must contain regular files only')
    }
  }
  visit(directory)
  return hash.digest('hex')
}

export function verifyRenderImage({ config, receipt, contextHash }) {
  if (!/^name\s*=\s*"audio-jobs"\s*$/m.test(config)) throw new Error('Unexpected Worker target')
  if (!/^registry\.cloudflare\.com\/a5b299b3ad15c1b5b895dc66f9357b17\/xeroflow-render@sha256:[a-f0-9]{64}$/.test(receipt.image)) throw new Error('Expected account-scoped immutable render image')
  const containers = config.match(/\[\[containers\]\]([\s\S]*?)(?=\n\[|$)/g) ?? []
  if (containers.length !== 1 || !/^class_name\s*=\s*"RenderContainer"\s*$/m.test(containers[0])) throw new Error('Unexpected container target')
  const image = containers[0].match(/^image\s*=\s*"([^"]+)"\s*$/m)?.[1]
  if (image !== receipt.image) throw new Error('Configured render image does not match qualified image')
  if (receipt.contextSha256 !== contextHash) throw new Error('Render context changed: build, verify and qualify a new image before release')
  if (!/^[a-f0-9]{40}$/.test(receipt.sourceCommit) || !receipt.checks?.includes('packaged-http-service') || !receipt.checks?.includes('real-media-13')) throw new Error('Missing render qualification provenance')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const worker = resolve(root, 'workers/audio-jobs')
  verifyRenderImage({
    config: readFileSync(resolve(worker, 'wrangler.toml'), 'utf8'),
    receipt: JSON.parse(readFileSync(resolve(worker, 'render-image.json'), 'utf8')),
    contextHash: renderContextHash(resolve(worker, 'container'))
  })
  console.log('Render image target, digest, context and qualification receipt match')
}
