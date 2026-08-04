import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import { transform } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'

import {
  WORKER_MODULE_COMPACTION_MARKER,
  buildCompressedPrecomputedManifestModule,
  compactDeployedWorkerModules,
  compactPrecomputedManifest,
  compactPlatformImports,
  compactWorkerModule
} from '../../scripts/compact-worker-module.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })
  ))
})

describe('Pages Worker postbuild compaction', () => {
  it('encodes the SSR manifest compactly and reconstructs its exact runtime contract', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-manifest-module-'))
    temporaryDirectories.push(directory)
    const modulePath = path.join(directory, 'client.precomputed.mjs')
    const manifest = {
      dependencies: {
        page: {
          scripts: {
            entry: {
              file: 'entry.js',
              module: true,
              resourceType: 'script',
              preload: true,
              prefetch: true
            }
          },
          styles: {
            theme: {
              file: 'theme.css',
              resourceType: 'style',
              preload: true,
              prefetch: false
            }
          },
          preload: {},
          prefetch: {}
        }
      },
      entrypoints: ['entry']
    }

    expect(typeof buildCompressedPrecomputedManifestModule).toBe('function')
    const source = buildCompressedPrecomputedManifestModule(manifest)
    await writeFile(modulePath, source, 'utf8')
    const loaded = await (await import(`${pathToFileURL(modulePath).href}?v=1`)).default()

    expect(loaded).toEqual(manifest)
    expect(source).toContain('XEROFLOW_COMPACT_PRECOMPUTED')
    expect(source).not.toContain('"resourceType"')
  })

  it('round-trips numeric zero without treating it as a missing resource field', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-manifest-zero-'))
    temporaryDirectories.push(directory)
    const modulePath = path.join(directory, 'client.precomputed.mjs')
    const manifest = {
      dependencies: {
        page: {
          scripts: {
            entry: {
              file: 0,
              module: false,
              resourceType: 'script'
            }
          },
          styles: {},
          preload: {},
          prefetch: {}
        }
      },
      entrypoints: []
    }

    await writeFile(
      modulePath,
      buildCompressedPrecomputedManifestModule(manifest),
      'utf8'
    )
    const loaded = await (await import(`${pathToFileURL(modulePath).href}?v=zero`)).default()

    expect(loaded).toEqual(manifest)
  })

  it('preserves the compact-manifest marker during deployed-module compaction', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-manifest-marker-'))
    temporaryDirectories.push(directory)
    const modulePath = path.join(directory, 'client.precomputed.mjs')
    const source = buildCompressedPrecomputedManifestModule({
      dependencies: {},
      entrypoints: []
    })
    await writeFile(modulePath, source, 'utf8')

    await compactDeployedWorkerModules(directory)

    await expect(readFile(modulePath, 'utf8')).resolves.toContain(
      'XEROFLOW_COMPACT_PRECOMPUTED'
    )
  })

  it('keeps only fields consumed by the precomputed SSR dependency renderer', () => {
    const result = compactPrecomputedManifest({
      dependencies: {
        page: {
          scripts: {
            entry: {
              file: 'entry.js',
              module: true,
              resourceType: 'script',
              name: 'entry',
              src: '/source/entry.ts',
              isEntry: true,
              imports: ['shared']
            }
          },
          styles: {},
          preload: {},
          prefetch: {}
        }
      },
      entrypoints: ['entry'],
      modules: {
        ignored: { file: 'unused.js' }
      }
    })

    expect(result).toEqual({
      dependencies: {
        page: {
          scripts: {
            entry: {
              file: 'entry.js',
              module: true,
              resourceType: 'script'
            }
          },
          styles: {},
          preload: {},
          prefetch: {}
        }
      },
      entrypoints: ['entry']
    })
  })

  it('fails closed when Nuxt emits an unknown manifest schema field', () => {
    expect(() => compactPrecomputedManifest({
      dependencies: {},
      entrypoints: [],
      modules: {},
      futureRuntimeContract: true
    })).toThrow(/unsupported top-level field/i)

    expect(() => compactPrecomputedManifest({
      dependencies: {
        page: {
          scripts: {
            entry: {
              file: 'entry.js',
              resourceType: 'script',
              futureLoadDirective: 'critical'
            }
          },
          styles: {},
          preload: {},
          prefetch: {}
        }
      },
      entrypoints: [],
      modules: {}
    })).toThrow(/unsupported resource field/i)
  })

  it('removes redundant bare platform imports without touching value imports', () => {
    const source = [
      'import "node:crypto";',
      'import"cloudflare:workers";',
      'import "side-effect-package";',
      'import { createHash } from "node:crypto";',
      'import worker from "cloudflare:workers";',
      'const lazy = import("node:buffer");'
    ].join('\n')

    expect(compactPlatformImports(source)).toBe([
      '',
      '',
      'import "side-effect-package";',
      'import { createHash } from "node:crypto";',
      'import worker from "cloudflare:workers";',
      'const lazy = import("node:buffer");'
    ].join('\n'))
    expect(
      compactPlatformImports(
        'import{createHash}from"node:crypto";'
        + 'import"node:buffer";import"node:crypto";export{createHash};'
      )
    ).toBe('import{createHash}from"node:crypto";export{createHash};')

    const documentationSnippet = 'const example = `platform setup:\nimport "node:crypto";\n`;\n'
    expect(compactPlatformImports!(documentationSnippet)).toBe(documentationSnippet)
  })

  it('compacts every generated module recursively and is idempotent', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-platform-imports-'))
    temporaryDirectories.push(directory)
    const nestedDirectory = path.join(directory, 'chunks', 'routes')
    await mkdir(nestedDirectory, { recursive: true })
    const firstModule = path.join(directory, 'index.mjs')
    const nestedModule = path.join(nestedDirectory, 'route.mjs')
    const sourceMap = `${nestedModule}.map`
    await writeFile(firstModule, 'import"node:crypto";export const value=1;\n', 'utf8')
    await writeFile(
      nestedModule,
      [
        'import{Buffer}from"node:buffer";import"node:buffer";export{Buffer};',
        '//# sourceMappingURL=route.mjs.map',
        ''
      ].join('\n'),
      'utf8'
    )
    await writeFile(sourceMap, '{"version":3}', 'utf8')

    await expect(compactDeployedWorkerModules(directory)).resolves.toEqual({
      changedFiles: 2,
      savedBytes: 75
    })
    await expect(readFile(firstModule, 'utf8')).resolves.toBe('export const value=1;\n')
    await expect(readFile(nestedModule, 'utf8')).resolves.toBe(
      'import{Buffer}from"node:buffer";export{Buffer};\n'
    )
    await expect(readFile(sourceMap, 'utf8')).resolves.toBe('{"version":3}')
    await expect(compactDeployedWorkerModules(directory)).resolves.toEqual({
      changedFiles: 0,
      savedBytes: 0
    })
  })

  it('name-preservingly minifies deployed modules without changing exports', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-deployed-minify-'))
    temporaryDirectories.push(directory)
    const modulePath = path.join(directory, 'route.mjs')
    const mapPath = `${modulePath}.map`
    const repeatedRuntimeSteps = Array.from(
      { length: 30 },
      () => '  deliberatelyVerboseIntermediateValue += 0'
    ).join('\n')
    const source = `export function stableRuntimeHandler(inputValue) {
  let deliberatelyVerboseIntermediateValue = inputValue
${repeatedRuntimeSteps}
  return deliberatelyVerboseIntermediateValue + 1
}
//# source${'MappingURL'}=route.mjs.map
`
    await writeFile(modulePath, source, 'utf8')
    await writeFile(mapPath, JSON.stringify({
      version: 3,
      sources: ['route.ts'],
      names: [],
      mappings: ''
    }), 'utf8')

    const first = await compactDeployedWorkerModules(directory)
    const compacted = await readFile(modulePath, 'utf8')
    const imported = await import(`${pathToFileURL(modulePath).href}?v=1`)

    expect(first.changedFiles).toBe(1)
    expect(first.savedBytes).toBeGreaterThan(500)
    expect(compacted).not.toContain('sourceMappingURL')
    expect(compacted.length).toBeLessThan(source.length)
    expect(imported.stableRuntimeHandler.name).toBe('stableRuntimeHandler')
    expect(imported.stableRuntimeHandler(4)).toBe(5)
    expect(JSON.parse(await readFile(mapPath, 'utf8'))).toMatchObject({ version: 3 })
    await expect(compactDeployedWorkerModules(directory)).resolves.toEqual({
      changedFiles: 0,
      savedBytes: 0
    })
    await expect(readFile(modulePath, 'utf8')).resolves.toBe(compacted)
  })

  it('converges keepNames compaction before writing a deployed module', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-convergent-minify-'))
    temporaryDirectories.push(directory)
    const modulePath = path.join(directory, 'route.mjs')
    const source = `import{af as defineHandler,aH as requireAuthentication,f as readRequestBody,aD as queryOne,c as createHttpError}from"../../../../nitro/nitro.mjs";const handler=defineHandler(async event=>{await requireAuthentication(event);const body=await readRequestBody(event),{publishedId,projectId,formatKey}=body;let selectedId=publishedId;if(!selectedId&&projectId&&formatKey&&(selectedId=(await queryOne("SELECT id FROM banner_published WHERE project_id = $1 AND format_key = $2 AND schedule_status = 'scheduled'",[projectId,formatKey]))?.id),!selectedId)throw createHttpError({statusCode:404,statusMessage:"Scheduled publish not found"});const result=await queryOne(\`
    UPDATE banner_published
    SET schedule_status = 'cancelled', scheduled_at = NULL, updated_at = NOW()
    WHERE id = $1 AND schedule_status = 'scheduled'
    RETURNING id, format_key AS "formatKey", schedule_status AS "scheduleStatus"
  \`,[selectedId]);if(!result)throw createHttpError({statusCode:404,statusMessage:"No scheduled publish found to cancel"});return result});export{handler as default};`
    await writeFile(modulePath, source, 'utf8')

    await compactDeployedWorkerModules(directory)
    const compacted = await readFile(modulePath, 'utf8')
    const nextTransform = await transform(compacted, {
      loader: 'js',
      format: 'esm',
      platform: 'neutral',
      target: 'esnext',
      minify: true,
      keepNames: true,
      legalComments: 'none'
    })

    expect(Buffer.byteLength(nextTransform.code)).toBeGreaterThanOrEqual(
      Buffer.byteLength(compacted)
    )
    await expect(compactDeployedWorkerModules(directory)).resolves.toEqual({
      changedFiles: 0,
      savedBytes: 0
    })
  })

  it('minifies a generated module once while preserving exported function names', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-compaction-'))
    temporaryDirectories.push(directory)
    const modulePath = path.join(directory, 'nitro.mjs')
    const repeatedRuntimeSteps = Array.from(
      { length: 30 },
      () => '  deliberatelyVerboseIntermediateValue += 0'
    ).join('\n')
    const source = `
export function stableRuntimeHandler(inputValue) {
  let deliberatelyVerboseIntermediateValue = inputValue
${repeatedRuntimeSteps}
  return deliberatelyVerboseIntermediateValue + 1
}
`
    await writeFile(modulePath, source, 'utf8')

    const first = await compactWorkerModule(modulePath)
    const compacted = await readFile(modulePath, 'utf8')
    const imported = await import(`${pathToFileURL(modulePath).href}?v=1`)

    expect(first).toEqual({
      changed: true,
      beforeBytes: Buffer.byteLength(source),
      afterBytes: Buffer.byteLength(compacted)
    })
    expect(compacted).toContain(WORKER_MODULE_COMPACTION_MARKER)
    expect(compacted.length).toBeLessThan(source.length)
    expect(imported.stableRuntimeHandler.name).toBe('stableRuntimeHandler')
    expect(imported.stableRuntimeHandler(4)).toBe(5)

    await expect(compactWorkerModule(modulePath)).resolves.toEqual({
      changed: false,
      beforeBytes: Buffer.byteLength(compacted),
      afterBytes: Buffer.byteLength(compacted)
    })
    await expect(readFile(modulePath, 'utf8')).resolves.toBe(compacted)
  })

  it('rebuilds a mapped generated module with a traceable and idempotent external source map', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-compaction-map-'))
    temporaryDirectories.push(directory)
    const modulePath = path.join(directory, 'nitro.mjs')
    const mapPath = `${modulePath}.map`
    const repeatedRuntimeSteps = Array.from(
      { length: 30 },
      () => '  deliberatelyVerboseIntermediateValue += 0'
    ).join('\n')
    const originalSource = `export function stableRuntimeHandler(inputValue: number) {
  let deliberatelyVerboseIntermediateValue = inputValue
${repeatedRuntimeSteps}
  deliberatelyVerboseIntermediateValue += 1
  return deliberatelyVerboseIntermediateValue
}
`
    const generated = await transform(originalSource, {
      sourcefile: 'runtime-source.ts',
      loader: 'ts',
      format: 'esm',
      sourcemap: 'external'
    })
    await writeFile(modulePath, generated.code, 'utf8')
    await writeFile(mapPath, generated.map, 'utf8')

    const first = await compactWorkerModule(modulePath)
    const compacted = await readFile(modulePath, 'utf8')
    const compactedMap = await readFile(mapPath, 'utf8')
    const traceMap = new TraceMap(compactedMap)
    const exportedLocalName = compacted.match(
      /\b([\w$]+)\s+as\s+stableRuntimeHandler\b/
    )?.[1]
    expect(exportedLocalName).toBeTruthy()
    const declarationOffset = compacted.indexOf(`function ${exportedLocalName}`)
      + 'function '.length
    const declarationPrefix = compacted.slice(0, declarationOffset)
    const originalPosition = originalPositionFor(traceMap, {
      line: declarationPrefix.split('\n').length,
      column: declarationPrefix.length - declarationPrefix.lastIndexOf('\n') - 1
    })

    expect(first.changed).toBe(true)
    expect(compacted).toMatch(/\/\/# sourceMappingURL=nitro\.mjs\.map\n$/)
    expect(originalPosition).toMatchObject({
      source: 'runtime-source.ts',
      line: 1
    })

    await expect(compactWorkerModule(modulePath)).resolves.toEqual({
      changed: false,
      beforeBytes: Buffer.byteLength(compacted),
      afterBytes: Buffer.byteLength(compacted)
    })
    await expect(readFile(modulePath, 'utf8')).resolves.toBe(compacted)
    await expect(readFile(mapPath, 'utf8')).resolves.toBe(compactedMap)
  })
})
