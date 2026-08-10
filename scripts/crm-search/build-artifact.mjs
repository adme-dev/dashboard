import { spawnSync } from 'node:child_process'
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import {
  cpSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { assertPreviewBindingReadback } from './preview-binding-guard.mjs'

const SHA = /^[a-f0-9]{40}$/u
const DIGEST = /^[a-f0-9]{64}$/u
const KEY_VERSION = /^[A-Za-z0-9._-]{1,64}$/u
export const REQUIRED_NODE_VERSION = '24.18.0'
export const FROZEN_BUILD_COMMAND = 'pnpm build\npnpm --dir workers/crm-search-consumer exec wrangler versions upload --dry-run --outdir <controlled-worker-output>\n'

function fail(code) {
  throw new Error(code)
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
}

export function canonicalArtifactJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalArtifactJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalArtifactJson(value[key])}`).join(',')}}`
  }
  fail('crm_search_artifact_noncanonical')
}

function digestCanonical(value) {
  return createHash('sha256').update(canonicalArtifactJson(value), 'utf8').digest('hex')
}

export function exactFileManifest(root) {
  const rootStat = lstatSync(root)
  if (rootStat.isSymbolicLink()) fail('crm_search_artifact_symlink_forbidden')
  if (!rootStat.isDirectory()) fail('crm_search_artifact_entry_invalid')
  const files = []
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory).sort()) {
      const absolute = path.join(directory, entry)
      const relative = prefix ? `${prefix}/${entry}` : entry
      const stat = lstatSync(absolute)
      if (stat.isSymbolicLink()) fail('crm_search_artifact_symlink_forbidden')
      if (stat.isDirectory()) visit(absolute, relative)
      else if (stat.isFile()) {
        files.push(Object.freeze({
          path: relative,
          size: stat.size,
          sha256: sha256File(absolute)
        }))
      } else fail('crm_search_artifact_entry_invalid')
    }
  }
  visit(root)
  return Object.freeze(files)
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
  if (manifest?.version === 'crm-search-frozen-artifact-v2') {
    const keys = [
      'artifactManifestDigest', 'pagesBundleDigest', 'workerBundleDigest',
      'bindingManifestDigest'
    ]
    if (actual.cleanTree !== true || manifest.cleanTree !== true) fail('crm_search_dirty_tree')
    if (actual.nodeVersion !== REQUIRED_NODE_VERSION || manifest.nodeVersion !== REQUIRED_NODE_VERSION) {
      fail('crm_search_node_version_mismatch')
    }
    if (actual.implementationSha !== manifest.implementationSha) fail('crm_search_sha_mismatch')
    for (const key of keys) {
      if (!DIGEST.test(manifest[key]) || actual[key] !== manifest[key]) fail(`crm_search_${key}_mismatch`)
    }
    return { ok: true }
  }
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

function requireBuildPins(pins) {
  const keys = [
    'implementationSha', 'nodeVersion', 'lockfileDigest', 'toolDigest',
    'buildCommandDigest', 'pagesConfigDigest', 'workerConfigDigest',
    'bindingManifestDigest'
  ]
  if (!exactKeys(pins, keys) || !SHA.test(pins.implementationSha)
    || pins.nodeVersion !== REQUIRED_NODE_VERSION
    || keys.filter(key => key.endsWith('Digest')).some(key => !DIGEST.test(pins[key]))) {
    fail('crm_search_artifact_pins_invalid')
  }
  return pins
}

export async function buildFrozenArtifact(input) {
  if (!input || input.expectedSha !== input.actualSha || !SHA.test(input.expectedSha)) {
    fail('crm_search_sha_mismatch')
  }
  if (input.cleanTree !== true) fail('crm_search_dirty_tree')
  if (input.detachedHead !== true) fail('crm_search_detached_checkout_required')
  if (!path.isAbsolute(input.outputDirectory || '')) fail('crm_search_artifact_output_invalid')
  if (!KEY_VERSION.test(input.signing?.keyVersion || '') || !input.signing?.privateKey) {
    fail('crm_search_artifact_signer_required')
  }
  const pins = requireBuildPins(input.pins)
  if (pins.implementationSha !== input.expectedSha) fail('crm_search_sha_mismatch')
  if (typeof input.buildPages !== 'function' || typeof input.buildConsumer !== 'function'
    || typeof input.stageProvenance !== 'function') {
    fail('crm_search_artifact_builder_required')
  }
  mkdirSync(input.outputDirectory, { recursive: false, mode: 0o700 })
  const pagesDirectory = path.join(input.outputDirectory, 'pages')
  const workerDirectory = path.join(input.outputDirectory, 'worker')
  const configDirectory = path.join(input.outputDirectory, 'config')
  await input.buildPages({ outputDirectory: pagesDirectory })
  await input.buildConsumer({ outputDirectory: workerDirectory })
  await input.stageProvenance({ outputDirectory: configDirectory })
  const pagesFiles = exactFileManifest(pagesDirectory)
  const workerFiles = exactFileManifest(workerDirectory)
  const configFiles = exactFileManifest(configDirectory)
  const requiredConfig = {
    'pnpm-lock.yaml': pins.lockfileDigest,
    'build-command.txt': pins.buildCommandDigest,
    'tool.json': pins.toolDigest,
    'pages.toml': pins.pagesConfigDigest,
    'worker.toml': pins.workerConfigDigest,
    'binding-manifest.json': pins.bindingManifestDigest
  }
  if (Object.keys(requiredConfig).some(file =>
    configFiles.find(entry => entry.path === file)?.sha256 !== requiredConfig[file])) {
    fail('crm_search_artifact_provenance_mismatch')
  }
  try {
    assertPreviewBindingReadback(
      JSON.parse(readFileSync(path.join(input.outputDirectory, 'config', 'binding-manifest.json'), 'utf8')),
      { pagesConfigText: readFileSync(path.join(input.outputDirectory, 'config', 'pages.toml'), 'utf8') }
    )
  } catch {
    fail('crm_search_binding_manifest_invalid')
  }
  const workerEntrypoint = input.workerEntrypoint || 'worker.mjs'
  if (!workerFiles.some(file => file.path === workerEntrypoint)) {
    fail('crm_search_worker_entrypoint_missing')
  }
  const payload = Object.freeze({
    version: 'crm-search-frozen-artifact-v2',
    ...pins,
    cleanTree: true,
    pages: Object.freeze({ directory: 'pages', files: pagesFiles, digest: digestCanonical(pagesFiles) }),
    worker: Object.freeze({
      directory: 'worker',
      entrypoint: `worker/${workerEntrypoint}`,
      files: workerFiles,
      digest: digestCanonical(workerFiles)
    }),
    config: Object.freeze({ directory: 'config', files: configFiles, digest: digestCanonical(configFiles) })
  })
  const bytes = Buffer.from(canonicalArtifactJson(payload), 'utf8')
  return Object.freeze({
    version: 'crm-search-frozen-artifact-envelope-v1',
    keyVersion: input.signing.keyVersion,
    payload,
    payloadSha256: createHash('sha256').update(bytes).digest('hex'),
    signature: sign(null, bytes, input.signing.privateKey).toString('base64url')
  })
}

export function verifyFrozenArtifactEnvelope(envelope, options) {
  if (!exactKeys(envelope, ['version', 'keyVersion', 'payload', 'payloadSha256', 'signature'])
    || envelope.version !== 'crm-search-frozen-artifact-envelope-v1'
    || !KEY_VERSION.test(envelope.keyVersion || '')
    || !DIGEST.test(envelope.payloadSha256 || '')
    || typeof envelope.signature !== 'string' || envelope.signature.length > 512
    || !/^[A-Za-z0-9_-]+$/u.test(envelope.signature)) {
    fail('crm_search_artifact_envelope_invalid')
  }
  if (!options?.keyring || options.keyring.version !== 'crm-search-artifact-verification-keyring-v1'
    || options.keyring.activeKeyVersion !== envelope.keyVersion
    || !exactKeys(options.keyring, ['version', 'activeKeyVersion', 'keys'])) {
    fail('crm_search_artifact_key_unavailable')
  }
  if (!options.keyring.keys || typeof options.keyring.keys !== 'object'
    || Array.isArray(options.keyring.keys)
    || Object.keys(options.keyring.keys).length < 1
    || Object.keys(options.keyring.keys).length > 3) fail('crm_search_artifact_key_unavailable')
  const encodedKey = options.keyring.keys?.[envelope.keyVersion]
  if (typeof encodedKey !== 'string' || encodedKey.length > 512) fail('crm_search_artifact_key_unavailable')
  requireBuildPins(Object.fromEntries([
    'implementationSha', 'nodeVersion', 'lockfileDigest', 'toolDigest',
    'buildCommandDigest', 'pagesConfigDigest', 'workerConfigDigest', 'bindingManifestDigest'
  ].map(key => [key, envelope.payload?.[key]])))
  if (!exactKeys(envelope.payload, [
    'version', 'implementationSha', 'nodeVersion', 'lockfileDigest', 'toolDigest',
    'buildCommandDigest', 'pagesConfigDigest', 'workerConfigDigest',
    'bindingManifestDigest', 'cleanTree', 'pages', 'worker', 'config'
  ]) || envelope.payload.version !== 'crm-search-frozen-artifact-v2'
  || envelope.payload.cleanTree !== true
  || !exactKeys(envelope.payload.pages, ['directory', 'files', 'digest'])
  || envelope.payload.pages.directory !== 'pages'
  || !exactKeys(envelope.payload.worker, ['directory', 'entrypoint', 'files', 'digest'])
  || envelope.payload.worker.directory !== 'worker'
  || !exactKeys(envelope.payload.config, ['directory', 'files', 'digest'])
  || envelope.payload.config.directory !== 'config'
  || ![envelope.payload.pages, envelope.payload.worker, envelope.payload.config]
    .every(section => DIGEST.test(section.digest) && Array.isArray(section.files)
      && section.files.every(file => exactKeys(file, ['path', 'size', 'sha256'])
        && typeof file.path === 'string' && file.path.length > 0
        && !path.isAbsolute(file.path) && !file.path.split('/').includes('..')
        && Number.isSafeInteger(file.size) && file.size >= 0 && DIGEST.test(file.sha256)))) {
    fail('crm_search_artifact_manifest_invalid')
  }
  const bytes = Buffer.from(canonicalArtifactJson(envelope.payload), 'utf8')
  if (createHash('sha256').update(bytes).digest('hex') !== envelope.payloadSha256) {
    fail('crm_search_artifact_manifest_digest_mismatch')
  }
  let valid = false
  try {
    valid = verify(null, bytes, createPublicKey({
      key: Buffer.from(encodedKey, 'base64url'), type: 'spki', format: 'der'
    }), Buffer.from(envelope.signature, 'base64url'))
  } catch {
    fail('crm_search_artifact_key_invalid')
  }
  if (!valid) fail('crm_search_artifact_signature_invalid')
  if (options.expectedPins
    && canonicalArtifactJson(requireBuildPins(options.expectedPins)) !== canonicalArtifactJson(
      Object.fromEntries(Object.keys(options.expectedPins).map(key => [key, envelope.payload[key]]))
    )) fail('crm_search_artifact_pins_mismatch')
  const pagesFiles = exactFileManifest(path.join(options.artifactRoot, envelope.payload.pages.directory))
  const workerFiles = exactFileManifest(path.join(options.artifactRoot, envelope.payload.worker.directory))
  const configFiles = exactFileManifest(path.join(options.artifactRoot, envelope.payload.config.directory))
  if (canonicalArtifactJson(pagesFiles) !== canonicalArtifactJson(envelope.payload.pages.files)
    || digestCanonical(pagesFiles) !== envelope.payload.pages.digest) fail('crm_search_pages_bundle_mismatch')
  if (canonicalArtifactJson(workerFiles) !== canonicalArtifactJson(envelope.payload.worker.files)
    || digestCanonical(workerFiles) !== envelope.payload.worker.digest) fail('crm_search_worker_bundle_mismatch')
  if (!workerFiles.some(file => `worker/${file.path}` === envelope.payload.worker.entrypoint)) {
    fail('crm_search_worker_entrypoint_missing')
  }
  if (canonicalArtifactJson(configFiles) !== canonicalArtifactJson(envelope.payload.config.files)
    || digestCanonical(configFiles) !== envelope.payload.config.digest) fail('crm_search_artifact_provenance_mismatch')
  const requiredConfig = {
    'pnpm-lock.yaml': envelope.payload.lockfileDigest,
    'build-command.txt': envelope.payload.buildCommandDigest,
    'tool.json': envelope.payload.toolDigest,
    'pages.toml': envelope.payload.pagesConfigDigest,
    'worker.toml': envelope.payload.workerConfigDigest,
    'binding-manifest.json': envelope.payload.bindingManifestDigest
  }
  if (Object.keys(requiredConfig).some(file =>
    configFiles.find(entry => entry.path === file)?.sha256 !== requiredConfig[file])) {
    fail('crm_search_artifact_provenance_mismatch')
  }
  try {
    assertPreviewBindingReadback(
      JSON.parse(readFileSync(path.join(options.artifactRoot, 'config', 'binding-manifest.json'), 'utf8')),
      { pagesConfigText: readFileSync(path.join(options.artifactRoot, 'config', 'pages.toml'), 'utf8') }
    )
  } catch {
    fail('crm_search_binding_manifest_invalid')
  }
  return Object.freeze({
    ok: true,
    artifactManifestDigest: envelope.payloadSha256,
    pagesBundleDigest: envelope.payload.pages.digest,
    workerBundleDigest: envelope.payload.worker.digest,
    manifest: envelope.payload
  })
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
  return digestCanonical(exactFileManifest(root))
}

export function releaseToolDescriptor(repositoryRoot) {
  const packagePath = path.join(repositoryRoot, 'node_modules/wrangler/package.json')
  const entryPath = path.join(repositoryRoot, 'node_modules/wrangler/bin/wrangler.js')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  if (packageJson.version !== '4.110.0') fail('crm_search_release_tool_version_mismatch')
  return `${JSON.stringify({
    name: 'wrangler', version: packageJson.version,
    entrySha256: sha256File(entryPath), node: REQUIRED_NODE_VERSION
  })}\n`
}

export function releaseToolDigest(repositoryRoot) {
  return createHash('sha256').update(releaseToolDescriptor(repositoryRoot)).digest('hex')
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== REQUIRED_NODE_VERSION) fail('crm_search_node_version_mismatch')
  const args = process.argv.slice(2)
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({ status: 'preview', mutationCount: 0, nodeVersion: REQUIRED_NODE_VERSION }))
  } else {
    if (!args.includes('--build')
      || process.env.CRM_SEARCH_ARTIFACT_BUILD_AUTHORIZATION !== 'crm-search-task18-ci-build-v1') {
      fail('crm_search_artifact_build_dry_run_required')
    }
    const outputIndex = args.indexOf('--output')
    const outputDirectory = outputIndex >= 0 ? path.resolve(args[outputIndex + 1] || '') : ''
    const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
    if (!outputDirectory || !path.isAbsolute(outputDirectory)
      || !path.relative(repositoryRoot, outputDirectory).startsWith('..')) {
      fail('crm_search_artifact_output_invalid')
    }
    const run = (command, commandArgs, options = {}) => {
      const result = spawnSync(command, commandArgs, {
        cwd: repositoryRoot, stdio: 'inherit', ...options
      })
      if (result.error || result.status !== 0) fail(`crm_search_artifact_build_failed:${command}`)
    }
    const capture = (command, commandArgs) => {
      const result = spawnSync(command, commandArgs, { cwd: repositoryRoot, encoding: 'utf8' })
      if (result.error || result.status !== 0) fail(`crm_search_artifact_build_failed:${command}`)
      return result.stdout.trim()
    }
    const expectedSha = process.env.CRM_SEARCH_RELEASE_SHA || ''
    const actualSha = capture('git', ['rev-parse', 'HEAD'])
    const cleanTree = capture('git', ['status', '--short']) === ''
    const detachedHead = spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], {
      cwd: repositoryRoot, stdio: 'ignore'
    }).status !== 0
    const bindingManifestPath = process.env.CRM_SEARCH_FROZEN_BINDING_MANIFEST_SOURCE || ''
    const privateKeyPem = process.env.CRM_SEARCH_ARTIFACT_SIGNING_PRIVATE_KEY_PEM || ''
    const keyVersion = process.env.CRM_SEARCH_ARTIFACT_SIGNING_KEY_VERSION || ''
    if (!bindingManifestPath || !privateKeyPem) fail('crm_search_artifact_build_inputs_missing')
    try {
      assertPreviewBindingReadback(JSON.parse(readFileSync(bindingManifestPath, 'utf8')), {
        pagesConfigText: readFileSync(path.join(repositoryRoot, 'wrangler.toml'), 'utf8')
      })
    } catch {
      fail('crm_search_binding_manifest_invalid')
    }
    const buildCommand = FROZEN_BUILD_COMMAND
    const tool = releaseToolDescriptor(repositoryRoot)
    const pins = {
      implementationSha: expectedSha,
      nodeVersion: REQUIRED_NODE_VERSION,
      lockfileDigest: sha256File(path.join(repositoryRoot, 'pnpm-lock.yaml')),
      buildCommandDigest: createHash('sha256').update(buildCommand).digest('hex'),
      toolDigest: releaseToolDigest(repositoryRoot),
      pagesConfigDigest: sha256File(path.join(repositoryRoot, 'wrangler.toml')),
      workerConfigDigest: sha256File(path.join(repositoryRoot, 'workers/crm-search-consumer/wrangler.toml')),
      bindingManifestDigest: sha256File(bindingManifestPath)
    }
    const envelope = await buildFrozenArtifact({
      expectedSha, actualSha, cleanTree, detachedHead, outputDirectory, pins,
      signing: { keyVersion, privateKey: createPrivateKey(privateKeyPem) },
      workerEntrypoint: 'index.js',
      buildPages({ outputDirectory: target }) {
        run('pnpm', ['build'])
        cpSync(path.join(repositoryRoot, 'dist'), target, { recursive: true, errorOnExist: true })
      },
      buildConsumer({ outputDirectory: target }) {
        run('pnpm', [
          '--dir', 'workers/crm-search-consumer', 'exec', 'wrangler',
          'versions', 'upload', '--dry-run', '--outdir', target
        ], { env: {
          ...process.env,
          WRANGLER_LOG_PATH: path.join(path.dirname(outputDirectory), 'crm-search-artifact-build.log')
        } })
      },
      stageProvenance({ outputDirectory: target }) {
        mkdirSync(target, { recursive: true, mode: 0o700 })
        cpSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), path.join(target, 'pnpm-lock.yaml'))
        writeFileSync(path.join(target, 'build-command.txt'), buildCommand, { mode: 0o600 })
        writeFileSync(path.join(target, 'tool.json'), tool, { mode: 0o600 })
        cpSync(path.join(repositoryRoot, 'wrangler.toml'), path.join(target, 'pages.toml'))
        cpSync(path.join(repositoryRoot, 'workers/crm-search-consumer/wrangler.toml'), path.join(target, 'worker.toml'))
        cpSync(bindingManifestPath, path.join(target, 'binding-manifest.json'))
      }
    })
    writeFileSync(
      path.join(outputDirectory, 'artifact-manifest.json'),
      `${JSON.stringify(envelope)}\n`, { mode: 0o600 }
    )
    console.log(JSON.stringify({
      status: 'built', mutationCount: 0, artifactManifestDigest: envelope.payloadSha256
    }))
  }
}
