import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  FROZEN_BUILD_COMMAND,
  releaseToolDigest,
  sha256File,
  verifyFrozenArtifactEnvelope
} from './build-artifact.mjs'

export function verifyFrozenArtifact({ manifestPath, artifactRoot, expectedPins, keyring }) {
  const envelope = JSON.parse(readFileSync(manifestPath, 'utf8'))
  return verifyFrozenArtifactEnvelope(envelope, { artifactRoot, expectedPins, keyring })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ status: 'verification-plan-only', mutationCount: 0 }))
  } else {
    const args = process.argv.slice(2)
    const value = (name) => {
      const index = args.indexOf(name)
      return index >= 0 ? args[index + 1] : undefined
    }
    const artifactRoot = path.resolve(value('--artifact-root') || '')
    const manifestPath = path.resolve(value('--manifest') || '')
    if (!args.includes('--verify') || !artifactRoot || !manifestPath
      || !process.env.CRM_SEARCH_ARTIFACT_VERIFICATION_KEYRING) {
      throw new Error('crm_search_artifact_verify_inputs_missing')
    }
    const envelope = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
    const result = verifyFrozenArtifact({
      manifestPath,
      artifactRoot,
      expectedPins: {
        implementationSha: process.env.CRM_SEARCH_RELEASE_SHA,
        nodeVersion: process.versions.node,
        lockfileDigest: sha256File(path.join(repositoryRoot, 'pnpm-lock.yaml')),
        buildCommandDigest: createHash('sha256').update(FROZEN_BUILD_COMMAND).digest('hex'),
        toolDigest: releaseToolDigest(repositoryRoot),
        pagesConfigDigest: sha256File(path.join(repositoryRoot, 'wrangler.toml')),
        workerConfigDigest: sha256File(path.join(repositoryRoot, 'workers/crm-search-consumer/wrangler.toml')),
        bindingManifestDigest: envelope.payload.bindingManifestDigest
      },
      keyring: JSON.parse(process.env.CRM_SEARCH_ARTIFACT_VERIFICATION_KEYRING)
    })
    console.log(JSON.stringify({ status: 'verified', mutationCount: 0, ...result }))
  }
}
