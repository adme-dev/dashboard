import { fileURLToPath } from 'node:url'

const adapterPath = fileURLToPath(new URL('../lib/pngjs-sync.ts', import.meta.url))
const inflaterPath = fileURLToPath(new URL('../lib/pngjs-sync-inflate.ts', import.meta.url))
const syncCodecPath = fileURLToPath(import.meta.resolve('pngjs/lib/png-sync.js'))

export function pngCodecInteropPlugin() {
  return {
    name: 'xeroflow-png-codec-interop',
    resolveId(source, importer) {
      if (source === 'pngjs') return adapterPath
      if (source === 'pngjs/lib/png-sync.js') return syncCodecPath
      if (source === './sync-inflate' && importer?.replaceAll('\\', '/').endsWith('/pngjs/lib/parser-sync.js')) return inflaterPath
      return null
    }
  }
}
