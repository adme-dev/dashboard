import { isAbsolute } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createLinuxEngineAdapter } from '../../workers/banner-engine/runtime/index'
import { createEngineHttp } from '../../workers/banner-engine/transport/http'
import {
  inspectEngineService,
  runEngineService
} from '../../workers/banner-engine/service/index'

const help = `Usage: pnpm exec tsx scripts/banner-studio/engine-service.ts
  --root /absolute/private/persistent/engine --root-device NUMBER --root-inode NUMBER
  --origin https://dashboard.example --manifest /absolute/path/runtime.json
  [--status] [--allow-loopback-http]

Default off: both BANNER_ENGINE_SERVICE_ENABLED=true and BANNER_ENGINE_ENABLED=true required.
BANNER_ENGINE_SERVICE_TOKEN is read from the private environment only after admission.
Root, root/staging and root/attempts must already exist, owner-only mode 0700.
Record root device/inode during operator host qualification, not dynamically at startup.
--status only inspects admission; available does not mean host-qualified or runtime-ready.
One global slot across both engines; never retries an attempt or clears an existing hold.
SIGINT/SIGTERM abort and await bounded cleanup; unconfirmed termination retains admission.
Exit 0 disabled/stopped, 2 held (operator reconciliation), 64 invalid/unavailable storage.
No automatic restart/reclaim, attempts deletion, requeue or hosted acceptance is implied.
`
function integer(value?: string): number {
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error()
  return Number(value)
}
export async function engineServiceMain(
  argv = process.argv.slice(2)
): Promise<number> {
  try {
    const { values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        'help': { type: 'boolean' },
        'status': { type: 'boolean' },
        'root': { type: 'string' },
        'root-device': { type: 'string' },
        'root-inode': { type: 'string' },
        'origin': { type: 'string' },
        'manifest': { type: 'string' },
        'allow-loopback-http': { type: 'boolean' }
      }
    })
    if (values.help) {
      console.log(help)
      return 0
    }
    const enabled
      = process.env.BANNER_ENGINE_SERVICE_ENABLED === 'true'
        && process.env.BANNER_ENGINE_ENABLED === 'true'
    if (!values.status && !enabled) {
      console.log(JSON.stringify({ status: 'disabled' }))
      return 0
    }
    const storage = {
      root: values.root ?? '',
      identity: {
        device: integer(values['root-device']),
        inode: integer(values['root-inode'])
      }
    }
    if (values.status) {
      const status = await inspectEngineService(storage)
      console.log(JSON.stringify(status))
      return status.status === 'available'
        ? 0
        : status.status === 'held'
          ? 2
          : 64
    }
    const controller = new AbortController()
    const stop = () => controller.abort()
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    try {
      const outcome = await runEngineService({
        ...storage,
        enabled: 'true',
        signal: controller.signal,
        workers: async () => {
          if (!values.manifest || !isAbsolute(values.manifest))
            throw new Error()
          const transport = {
            origin: values.origin ?? '',
            serviceToken: process.env.BANNER_ENGINE_SERVICE_TOKEN ?? '',
            allowLoopbackHttp: values['allow-loopback-http']
          }
          createEngineHttp(transport)
          const workers = []
          for (const engine of ['photocraft', 'vectorcraft'] as const) {
            workers.push({
              ...transport,
              adapter: await createLinuxEngineAdapter(engine, values.manifest)
            })
          }
          return workers
        }
      })
      console.log(JSON.stringify(outcome))
      return outcome.status === 'held'
        ? 2
        : outcome.status === 'configuration-error'
          ? 64
          : 0
    } finally {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
    }
  } catch {
    console.error('Engine service configuration unavailable')
    return 64
  }
}
if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  // A watchdog result may leave noncooperative work alive; exiting is not proof
  // of native death. The durable admission hold remains authoritative.
  process.exitCode = await engineServiceMain()
  if (process.exitCode === 2) process.exit(2)
}
