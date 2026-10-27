// Explicit opt-in proof: real local Linux engine + real Banner store/exporter.
// Persistence is a local fixture; no hosted API, provider or desktop GUI calls.
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve('output/editable-artwork-linux-native', `integration-${new Date().toISOString().replace(/[:.]/g, '-')}`)
mkdirSync(root, { recursive: true })
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', 'test/banner/linuxNativeRoundtrip.test.ts'], {
  stdio: 'inherit',
  timeout: 300_000,
  env: { ...process.env, BANNER_LINUX_NATIVE_PROOF_ROOT: root }
})
console.log(`Linux native integration evidence: ${root}`)
if (result.error) throw result.error
process.exitCode = result.status ?? 1
