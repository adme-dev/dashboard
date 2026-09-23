import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultDirectory = fileURLToPath(new URL('../shared/pageStudio/generated/', import.meta.url))
const names = ['astroBuildIdentityFixtures.json', 'builderGraphVerifier.mjs', 'builderGraphVerifier.d.mts', 'builderGraphFixtures.json', 'builderGraphLicenses.txt']
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

/** Local integrity, not proof of correspondence to absent Studio source.
 * Paired release checks must also run Studio's deterministic --check command. */
export async function verifyPageStudioBuilderVerifier(directory = defaultDirectory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'builderGraphVerifier.manifest.json'), 'utf8'))
  if (manifest.version !== 1 || manifest.contractVersion !== 1 || !Array.isArray(manifest.sources)
    || JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify([...names].sort())
    || digest(JSON.stringify(manifest.sources)) !== manifest.sourceDigest) throw new Error('Invalid verifier provenance manifest')
  const sourcePaths = manifest.sources.map(source => source.path)
  if (new Set(sourcePaths).size !== sourcePaths.length || sourcePaths.some(source => path.isAbsolute(source) || source.split('/').includes('..'))
    || JSON.stringify(sourcePaths) !== JSON.stringify([...sourcePaths].sort())) throw new Error('Invalid verifier source paths')
  await Promise.all(names.map(async (name) => {
    const bytes = await readFile(path.join(directory, name))
    if (digest(bytes) !== manifest.files[name]) throw new Error(`Verifier file digest mismatch: ${name}`)
    if ((name.endsWith('.mjs') || name.endsWith('.d.mts')) && /^\s*(?:import\s|export\s[^\n]*\sfrom\s)/m.test(bytes.toString())) throw new Error('Verifier must have no runtime or type imports')
  }))
  return { sourceDigest: manifest.sourceDigest, files: names.length }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyPageStudioBuilderVerifier()))
}
