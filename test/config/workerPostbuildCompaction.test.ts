import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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
  compactSqlLiterals,
  compactWorkerModuleFilenames,
  compactWorkerModule,
  resolvePrecomputedManifestPath
} from '../../scripts/compact-worker-module.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })
  ))
})

describe('Pages Worker postbuild compaction', () => {
  it('resolves the Nuxt 4.5 precomputed manifest location', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-manifest-path-'))
    temporaryDirectories.push(directory)
    const manifestPath = path.join(directory, 'chunks', 'virtual', 'precomputed.mjs')
    await mkdir(path.dirname(manifestPath), { recursive: true })
    await writeFile(manifestPath, 'export default {}', 'utf8')

    await expect(resolvePrecomputedManifestPath(directory)).resolves.toBe(manifestPath)
  })

  it('continues to resolve the legacy Nuxt precomputed manifest location', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-manifest-legacy-path-'))
    temporaryDirectories.push(directory)
    const manifestPath = path.join(directory, 'chunks', 'build', 'client.precomputed.mjs')
    await mkdir(path.dirname(manifestPath), { recursive: true })
    await writeFile(manifestPath, 'export default {}', 'utf8')

    await expect(resolvePrecomputedManifestPath(directory)).resolves.toBe(manifestPath)
  })

  it('fails closed when Nuxt emits no recognized precomputed manifest', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-manifest-missing-'))
    temporaryDirectories.push(directory)

    await expect(resolvePrecomputedManifestPath(directory)).rejects.toThrow(
      /precomputed manifest/i
    )
  })

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
    expect(source).toContain(`from 'node:zlib'`)
    expect(source).toContain('brotliDecompressSync')
    expect(source).not.toContain(`from 'fflate'`)
    expect(source).not.toContain('"resourceType"')
  })

  it('preserves Nuxt 4.5 modules and its direct-value export contract', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-manifest-value-'))
    temporaryDirectories.push(directory)
    const modulePath = path.join(directory, 'precomputed.mjs')
    const entryId = '../node_modules/nuxt/dist/app/entry.js'
    const manifest = {
      dependencies: {
        [entryId]: {
          scripts: {
            [entryId]: {
              file: 'entry.js',
              resourceType: 'script',
              module: true,
              src: entryId,
              isEntry: true,
              imports: ['runtime.js'],
              dynamicImports: ['pages/portal/login.vue'],
              css: ['entry.css'],
              assets: []
            }
          },
          styles: {},
          preload: {},
          prefetch: {}
        }
      },
      entrypoints: [entryId],
      modules: {
        [entryId]: {
          file: 'entry.js',
          resourceType: 'script',
          module: true,
          src: entryId,
          isEntry: true
        },
        'pages/portal/login.vue': {
          file: 'portal-login.js',
          resourceType: 'script',
          module: true
        }
      }
    }

    const source = buildCompressedPrecomputedManifestModule(manifest, {
      contract: 'value'
    })
    await writeFile(modulePath, source, 'utf8')
    const loaded = (await import(`${pathToFileURL(modulePath).href}?v=1`)).default

    expect(typeof loaded).toBe('object')
    expect(loaded).toEqual(manifest)
    expect(loaded.modules[entryId].isEntry).toBe(true)
    expect(source).toContain('const manifest = decodePrecomputedManifest()')
    expect(source).toContain('brotliDecompressSync')
    expect(source).not.toContain('gunzipSync')
    expect(source).not.toContain('DecompressionStream')
    expect(source).not.toContain('await decodePrecomputedManifest()')
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

  it('compacts static SQL whitespace without changing quoted values or commented queries', () => {
    const source = [
      "const query = `\n  SELECT id,\n         name\n    FROM accounts\n   WHERE note = 'keep   this'\n     AND label = \"Keep  Case\"\n`",
      'const dollarQuoted = `SELECT $$keep   this$$ AS body\n  FROM messages`',
      'const commented = `SELECT id -- the newline terminates this comment\n  FROM accounts`',
      'const ordinary = `line one   line two`'
    ].join('\n')

    expect(compactSqlLiterals(source)).toBe([
      "const query = \" SELECT id, name FROM accounts WHERE note = 'keep   this' AND label = \\\"Keep  Case\\\" \"",
      'const dollarQuoted = "SELECT $$keep   this$$ AS body FROM messages"',
      'const commented = `SELECT id -- the newline terminates this comment\n  FROM accounts`',
      'const ordinary = `line one   line two`'
    ].join('\n'))
  })

  it('keeps a boundary space so concatenated fragments do not glue placeholders to keywords', () => {
    // Nitro/esbuild lowers `\`WHERE c.code = $1 ${cond}\`` to `"WHERE c.code = $1 " + cond`.
    const source = [
      'const a = "SELECT p.* FROM qr_pages p\\n     WHERE c.code = $1 " + (draft ? "" : "AND p.is_published = TRUE")',
      'const b = "SELECT 1 FROM t\\n  WHERE tenant_id = $1 " + filter + "\\n  ORDER BY 1"'
    ].join('\n')
    const out = compactSqlLiterals(source)
    expect(out).toContain('"SELECT p.* FROM qr_pages p WHERE c.code = $1 " + (draft')
    expect(out).toContain('"SELECT 1 FROM t WHERE tenant_id = $1 " + filter')
    expect(out).not.toMatch(/\$1"\s*\+/)
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

  it('shortens generated chunk paths without breaking module references', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-module-paths-'))
    temporaryDirectories.push(directory)
    const buildDirectory = path.join(directory, 'chunks', 'build')
    const routeDirectory = path.join(directory, 'chunks', 'routes', 'api', 'agency')
    const sharedDirectory = path.join(directory, 'chunks', 'shared')
    const assetDirectory = path.join(directory, 'chunks', 'assets')
    await Promise.all([
      mkdir(buildDirectory, { recursive: true }),
      mkdir(routeDirectory, { recursive: true }),
      mkdir(sharedDirectory, { recursive: true }),
      mkdir(assetDirectory, { recursive: true })
    ])

    const entryPath = path.join(directory, '_nitro.js')
    const buildPath = path.join(buildDirectory, 'very-long-generated-build-name.mjs')
    const routePath = path.join(routeDirectory, 'very-long-generated-route-name.get.mjs')
    const sharedPath = path.join(sharedDirectory, 'very-long-generated-shared-name.mjs')
    await writeFile(entryPath, [
      `import { buildValue } from './chunks/build/very-long-generated-build-name.mjs'`,
      `export { sharedValue } from './chunks/shared/very-long-generated-shared-name.mjs'`,
      `export const loadRoute = () => import('./chunks/routes/api/agency/very-long-generated-route-name.get.mjs')`,
      'export default buildValue'
    ].join('\n'), 'utf8')
    await writeFile(buildPath, [
      `import { sharedValue } from '../shared/very-long-generated-shared-name.mjs'`,
      'export const buildValue = sharedValue + 1'
    ].join('\n'), 'utf8')
    await writeFile(routePath, [
      `import { buildValue } from '../../../build/very-long-generated-build-name.mjs'`,
      `import { assetValue } from '../../../assets/runtime.js'`,
      'export default buildValue + assetValue'
    ].join('\n'), 'utf8')
    await writeFile(sharedPath, 'export const sharedValue = 40\n', 'utf8')
    await writeFile(
      path.join(assetDirectory, 'runtime.js'),
      'export const assetValue = 1\n',
      'utf8'
    )

    const first = await compactWorkerModuleFilenames(directory)
    const compactDirectory = path.join(directory, 'chunks', 'm')
    const compactNames = (await readdir(compactDirectory)).sort()
    const entrySource = await readFile(entryPath, 'utf8')
    const imported = await import(`${pathToFileURL(entryPath).href}?v=short-paths`)

    expect(first.renamedFiles).toBe(3)
    expect(first.rewrittenFiles).toBe(3)
    expect(first.savedSpecifierBytes).toBeGreaterThan(100)
    expect(compactNames).toEqual(['0.mjs', '1.mjs', '2.mjs'])
    expect(entrySource).not.toContain('very-long-generated')
    expect(imported.default).toBe(41)
    expect(imported.sharedValue).toBe(40)
    await expect(imported.loadRoute()).resolves.toMatchObject({ default: 42 })
    await expect(access(buildPath)).rejects.toThrow()
    await expect(access(routePath)).rejects.toThrow()
    await expect(access(sharedPath)).rejects.toThrow()

    const beforeSecondRun = await Promise.all([
      readFile(entryPath, 'utf8'),
      ...compactNames.map(name => readFile(path.join(compactDirectory, name), 'utf8'))
    ])
    await expect(compactWorkerModuleFilenames(directory)).resolves.toEqual({
      renamedFiles: 0,
      rewrittenFiles: 0,
      savedSpecifierBytes: 0
    })
    await expect(Promise.all([
      readFile(entryPath, 'utf8'),
      ...compactNames.map(name => readFile(path.join(compactDirectory, name), 'utf8'))
    ])).resolves.toEqual(beforeSecondRun)
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

  it('drops internal names from route and generated build chunks while preserving named runtime exports', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-api-route-minify-'))
    temporaryDirectories.push(directory)
    const auditedDirectory = path.join(
      directory,
      'chunks',
      'routes',
      'api',
      'public',
      'banner-assets'
    )
    const unauditedDirectory = path.join(directory, 'chunks', 'routes', 'api', 'public')
    const auditedPageDirectory = path.join(directory, 'chunks', 'build')
    await mkdir(auditedDirectory, { recursive: true })
    await mkdir(auditedPageDirectory, { recursive: true })
    const modulePath = path.join(auditedDirectory, '_token_.get.mjs')
    const auditedPageModulePath = path.join(auditedPageDirectory, 'governance-BRhMTB2H.mjs')
    const namedPageModulePath = path.join(auditedPageDirectory, 'component-named.mjs')
    const defaultOnlyModulePath = path.join(unauditedDirectory, 'probe.get.mjs')
    const namedExportModulePath = path.join(unauditedDirectory, 'named.get.mjs')
    const source = `const handler = async function deliberatelyVerboseCapabilityHandler(event) {
  const deliberatelyVerboseIntermediateValue = event.value
  return deliberatelyVerboseIntermediateValue + 1
}
export { handler as default }
`
    await writeFile(modulePath, source, 'utf8')
    await writeFile(auditedPageModulePath, source, 'utf8')
    await writeFile(namedPageModulePath, source.replace(
      'export { handler as default }',
      'export { handler as componentHandler }'
    ), 'utf8')
    await writeFile(defaultOnlyModulePath, source, 'utf8')
    await writeFile(namedExportModulePath, source.replace(
      'export { handler as default }',
      'export { handler as stableRuntimeHandler }'
    ), 'utf8')

    await compactDeployedWorkerModules(directory)
    const compacted = await readFile(modulePath, 'utf8')
    const auditedPageCompacted = await readFile(auditedPageModulePath, 'utf8')
    const namedPageCompacted = await readFile(namedPageModulePath, 'utf8')
    const defaultOnlyCompacted = await readFile(defaultOnlyModulePath, 'utf8')
    const namedExportCompacted = await readFile(namedExportModulePath, 'utf8')
    const imported = await import(`${pathToFileURL(modulePath).href}?v=api-route`)
    const auditedPageImported = await import(
      `${pathToFileURL(auditedPageModulePath).href}?v=audited-page`
    )
    const namedPageImported = await import(
      `${pathToFileURL(namedPageModulePath).href}?v=named-page`
    )
    const defaultOnlyImported = await import(
      `${pathToFileURL(defaultOnlyModulePath).href}?v=default-api-route`
    )
    const namedExportImported = await import(
      `${pathToFileURL(namedExportModulePath).href}?v=named-api-route`
    )

    expect(compacted).not.toContain('deliberatelyVerboseCapabilityHandler')
    expect(imported.default.name).not.toBe('deliberatelyVerboseCapabilityHandler')
    await expect(imported.default({ value: 4 })).resolves.toBe(5)
    expect(auditedPageCompacted).not.toContain('deliberatelyVerboseCapabilityHandler')
    expect(auditedPageImported.default.name).not.toBe('deliberatelyVerboseCapabilityHandler')
    await expect(auditedPageImported.default({ value: 4 })).resolves.toBe(5)
    expect(namedPageCompacted).not.toContain('deliberatelyVerboseCapabilityHandler')
    expect(namedPageImported.componentHandler.name).not.toBe('deliberatelyVerboseCapabilityHandler')
    await expect(namedPageImported.componentHandler({ value: 4 })).resolves.toBe(5)
    expect(defaultOnlyCompacted).not.toContain('deliberatelyVerboseCapabilityHandler')
    expect(defaultOnlyImported.default.name).not.toBe('deliberatelyVerboseCapabilityHandler')
    await expect(defaultOnlyImported.default({ value: 4 })).resolves.toBe(5)
    expect(namedExportCompacted).toContain('deliberatelyVerboseCapabilityHandler')
    expect(namedExportImported.stableRuntimeHandler.name).toBe(
      'deliberatelyVerboseCapabilityHandler'
    )
    await expect(namedExportImported.stableRuntimeHandler({ value: 4 })).resolves.toBe(5)
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
