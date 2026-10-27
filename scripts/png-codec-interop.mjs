import { fileURLToPath } from 'node:url'

const adapterPath = fileURLToPath(new URL('../lib/pngjs-sync.ts', import.meta.url))
const inflaterPath = fileURLToPath(new URL('../lib/pngjs-sync-inflate.ts', import.meta.url))
const syncCodecPath = fileURLToPath(import.meta.resolve('pngjs/lib/png-sync.js'))

export function pngCodecInteropPlugin() {
  return {
    name: 'xeroflow-png-codec-interop',
    buildStart() {
      // Preserve the actual shared codec's public boundary even when every
      // consumer is folded into one Nitro chunk. This is the same module ID
      // used by resolveId below, not a second codec or a diagnostic endpoint.
      this.emitFile({
        type: 'chunk',
        id: adapterPath,
        fileName: 'chunks/png-codec.mjs',
        preserveSignature: 'strict'
      })
    },
    resolveId(source, importer) {
      if (source === 'pngjs') return adapterPath
      if (source === 'pngjs/lib/png-sync.js') return syncCodecPath
      if (source === './sync-inflate' && importer?.replaceAll('\\', '/').endsWith('/pngjs/lib/parser-sync.js')) return inflaterPath
      return null
    }
  }
}
