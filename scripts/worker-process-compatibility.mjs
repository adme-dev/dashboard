/** unenv 2.0.0-rc.24 forwards process getters through a Proxy receiver. Its
 * fallback Process uses ES private fields, which that receiver does not own.
 * Bind getter reads to their owning object; retain the original process and env.
 * Review this checked patch when upgrading unenv instead of silently drifting. */
export function workerProcessCompatibilityPlugin() {
  return {
    name: 'xeroflow-worker-process-getters',
    transform(source, id) {
      if (!id.replaceAll('\\', '/').endsWith('/unenv/dist/runtime/polyfill/process.mjs')) return null
      const replacements = [
        ['Reflect.get(target, prop, receiver)', 'Reflect.get(target, prop, target)'],
        ['Reflect.get(processModule, prop, receiver)', 'Reflect.get(processModule, prop, processModule)']
      ]
      for (const [before] of replacements) {
        if (source.split(before).length !== 2) {
          throw new Error('[worker-process] Upstream process proxy changed; review the compatibility patch')
        }
      }
      return { code: replacements.reduce((code, [before, after]) => code.replace(before, after), source), map: null }
    }
  }
}
