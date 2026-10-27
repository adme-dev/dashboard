import { isAbsolute } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createEngineHttp } from '../../workers/banner-engine/transport/http'
import { runEngineWorkerOnce } from '../../workers/banner-engine/transport/index'
import { createLinuxEngineAdapter } from '../../workers/banner-engine/runtime/index'

const help = `Usage: pnpm exec tsx scripts/banner-studio/engine-worker.ts --once
  --origin https://dashboard.example --engine photocraft|vectorcraft
  --manifest /absolute/path/runtime.json
  --staging-root /absolute/private/staging --workspace-root /absolute/durable/attempts
  [--allow-loopback-http]

Requires BANNER_ENGINE_ENABLED=true and BANNER_ENGINE_SERVICE_TOKEN in the environment.
Runs one authenticated pull with the existing trusted Linux runtime. No automatic retry.
Exit codes: 0 idle/accepted success; 1 known failure; 2 uncertainty; 64 configuration/runtime unavailable.
The loopback flag permits HTTP only to localhost, 127.0.0.1 or [::1] for local proof.
`

export async function engineWorkerMain(argv = process.argv.slice(2)): Promise<number> {
  try {
    const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
      'help': { type: 'boolean' }, 'once': { type: 'boolean' }, 'origin': { type: 'string' },
      'engine': { type: 'string' }, 'manifest': { type: 'string' },
      'staging-root': { type: 'string' }, 'workspace-root': { type: 'string' },
      'allow-loopback-http': { type: 'boolean' }
    } })
    if (values.help) {
      console.log(help)
      return 0
    }
    if (!values.once || process.env.BANNER_ENGINE_ENABLED !== 'true'
      || !values.origin || !['photocraft', 'vectorcraft'].includes(values.engine ?? '')
      || !values.manifest || !isAbsolute(values.manifest)
      || !values['staging-root'] || !isAbsolute(values['staging-root'])
      || !values['workspace-root'] || !isAbsolute(values['workspace-root'])) throw new Error()
    const configuration = {
      origin: values.origin, serviceToken: process.env.BANNER_ENGINE_SERVICE_TOKEN ?? '',
      allowLoopbackHttp: values['allow-loopback-http'], stagingRoot: values['staging-root'], workspaceRoot: values['workspace-root']
    }
    // Check origin and credential configuration before loading any native runtime.
    createEngineHttp(configuration)
    const adapter = await createLinuxEngineAdapter(values.engine as 'photocraft' | 'vectorcraft', values.manifest)
    const controller = new AbortController()
    const cancel = () => controller.abort()
    process.on('SIGINT', cancel)
    process.on('SIGTERM', cancel)
    try {
      const outcome = await runEngineWorkerOnce({ ...configuration, adapter, signal: controller.signal })
      console.log(JSON.stringify(outcome))
      return outcome.status === 'idle' || outcome.status === 'succeeded' ? 0 : outcome.status === 'uncertain' ? 2 : 1
    } finally {
      process.removeListener('SIGINT', cancel)
      process.removeListener('SIGTERM', cancel)
    }
  } catch {
    // Runtime failures may contain secrets, paths or subprocess diagnostics.
    console.error('Engine worker configuration or runtime unavailable')
    return 64
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await engineWorkerMain()
}
