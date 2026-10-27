import { build } from 'esbuild'
import { createRequire, builtinModules } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pngCodecInteropPlugin } from '../../scripts/png-codec-interop.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)
const codec = pngCodecInteropPlugin()
export async function buildBundle(entryPoint = 'src/index.ts', outfile = 'dist/index.js') {
  await build({
    absWorkingDir: root, entryPoints: [entryPoint], outfile, bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', conditions: ['workerd', 'worker', 'import'],
    mainFields: ['browser', 'module', 'main'], external: ['cloudflare:workers', 'node:*'], sourcemap: true,
    banner: { js: `import { createRequire as __nodeCreateRequire } from 'node:module'; const require = __nodeCreateRequire('/banner-renderer.js');` },
    plugins: [{ name: 'png-sync-workerd', setup(builder) {
      builder.onLoad({ filter: /.*/, namespace: 'png-sync-inflate-cjs' }, args => ({ contents: `module.exports = require(${JSON.stringify(args.path)}).default;`, loader: 'js', resolveDir: root }))
      builder.onResolve({ filter: /^[a-z][a-z0-9_/]*$/ }, args => builtinModules.includes(args.path) ? { path: 'node:' + args.path, external: true } : undefined)
      builder.onResolve({ filter: /^(pngjs|pngjs\/lib\/png-sync\.js|\.\/sync-inflate)$/ }, (args) => {
        const path = codec.resolveId(args.path, args.importer)
        if (!path) return undefined
        return { path: args.path === 'pngjs/lib/png-sync.js' ? require.resolve('pngjs/lib/png-sync.js') : path, ...(args.path === './sync-inflate' ? { namespace: 'png-sync-inflate-cjs' } : {}) }
      })
    } }]
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildBundle()
