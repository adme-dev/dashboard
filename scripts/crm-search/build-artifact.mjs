import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const SHA = /^[a-f0-9]{40}$/u
const DIGEST = /^[a-f0-9]{64}$/u
export const REQUIRED_NODE_VERSION = '24.18.0'

function fail(code) {
  throw new Error(code)
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
}

export function createArtifactManifest(input) {
  const keys = [
    'implementationSha', 'nodeVersion', 'cleanTree', 'artifactDigest',
    'lockfileDigest', 'buildCommandDigest', 'toolDigest', 'pagesConfigDigest',
    'workerConfigDigest', 'bindingManifestDigest'
  ]
  if (!exactKeys(input, keys)) fail('crm_search_artifact_manifest_invalid')
  if (!SHA.test(input.implementationSha)) fail('crm_search_artifact_sha_invalid')
  if (input.nodeVersion !== REQUIRED_NODE_VERSION) fail('crm_search_node_version_mismatch')
  if (input.cleanTree !== true) fail('crm_search_dirty_tree')
  for (const key of keys.filter(key => key.endsWith('Digest'))) {
    if (!DIGEST.test(input[key])) fail('crm_search_artifact_manifest_invalid')
  }
  return Object.freeze({ version: 'crm-search-frozen-artifact-v1', ...input })
}

export function verifyArtifact(manifest, actual) {
  if (!manifest || manifest.version !== 'crm-search-frozen-artifact-v1') {
    fail('crm_search_release_manifest_required')
  }
  if (actual.cleanTree !== true || manifest.cleanTree !== true) fail('crm_search_dirty_tree')
  if (actual.nodeVersion !== REQUIRED_NODE_VERSION || manifest.nodeVersion !== REQUIRED_NODE_VERSION) {
    fail('crm_search_node_version_mismatch')
  }
  if (actual.implementationSha !== manifest.implementationSha) fail('crm_search_sha_mismatch')
  if (actual.artifactDigest !== manifest.artifactDigest) fail('artifact_digest_mismatch')
  if (actual.bindingManifestDigest !== manifest.bindingManifestDigest) {
    fail('crm_search_binding_manifest_mismatch')
  }
  return { ok: true }
}

export async function runArtifactBuild(input) {
  if (!input || !SHA.test(input.expectedSha) || input.actualSha !== input.expectedSha) {
    fail('crm_search_sha_mismatch')
  }
  if (input.cleanTree !== true) fail('crm_search_dirty_tree')
  if (input.detachedHead !== true) fail('crm_search_detached_checkout_required')
  if (input.nodeVersion !== REQUIRED_NODE_VERSION) fail('crm_search_node_version_mismatch')
  if (typeof input.buildPages !== 'function' || typeof input.buildConsumer !== 'function') {
    fail('crm_search_artifact_builder_required')
  }

  const pages = await input.buildPages()
  const consumer = await input.buildConsumer()
  return Object.freeze({ pages, consumer })
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function sha256Directory(root) {
  const hash = createHash('sha256')
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory).sort()) {
      const absolute = path.join(directory, entry)
      const relative = prefix ? `${prefix}/${entry}` : entry
      const stat = lstatSync(absolute)
      if (stat.isSymbolicLink()) fail('crm_search_artifact_symlink_forbidden')
      if (stat.isDirectory()) visit(absolute, relative)
      else if (stat.isFile()) {
        hash.update(relative, 'utf8')
        hash.update('\0')
        hash.update(readFileSync(absolute))
        hash.update('\0')
      } else fail('crm_search_artifact_entry_invalid')
    }
  }
  visit(root)
  return hash.digest('hex')
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== REQUIRED_NODE_VERSION) fail('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) fail('crm_search_artifact_build_dry_run_required')
  console.log(JSON.stringify({ status: 'preview', mutationCount: 0, nodeVersion: REQUIRED_NODE_VERSION }))
}
