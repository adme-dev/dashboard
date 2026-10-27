import { chmod } from 'node:fs/promises'
import { bannerEngineCapabilitySchema } from '../../../shared/bannerEngine'
import { EngineAdapterError, type EngineAdapter } from '../runner/index'
import { loadLinuxRuntime, renderLinuxPreview, LinuxRuntimeError } from './render-preview.mjs'

/** Manifest is trusted operator configuration, never a job-supplied path. */
export async function createLinuxEngineAdapter(engine: 'photocraft' | 'vectorcraft', manifestPath?: string): Promise<EngineAdapter> {
  const runtime = await loadLinuxRuntime(engine, manifestPath)
  return {
    capability: bannerEngineCapabilitySchema.parse(runtime.capability),
    async run(context) {
      try {
        // Runner supplies a private, immutable staged copy. The container mounts
        // only this inode, read-only; directory/receipt parents are never mounted.
        await chmod(context.inputPath, 0o444)
        await renderLinuxPreview(runtime, context)
      } catch (error) {
        const code = error instanceof LinuxRuntimeError && error.code === 'resource-limit' ? 'resource-limit' : 'engine-failed'
        // The native runtime replaces execution errors with cleanup-failed when
        // container absence cannot be verified. Only its known execution errors
        // certify cleanup; unknown exceptions remain conservative holds.
        const termination = error instanceof LinuxRuntimeError && ['resource-limit', 'engine-failed'].includes(error.code)
          ? 'adapter-settled'
          : 'unconfirmed'
        throw new EngineAdapterError(code, termination)
      }
    }
  }
}
