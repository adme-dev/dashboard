import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const worker = fileURLToPath(new URL('./', import.meta.url))
for (const environment of ['staging', 'production']) {
  const name = environment === 'staging' ? 'ManagementStagingEnv' : 'ManagementProductionEnv'
  const file = `worker-${environment}.d.ts`
  // Wrangler includes these arguments in its generated header and hash. Keep
  // them relative so separate checkouts produce identical declarations.
  execFileSync(process.execPath, [`${root}node_modules/wrangler/bin/wrangler.js`, 'types', file, '--config', `wrangler.${environment}.jsonc`, '--env-interface', name, '--include-runtime=false'], { cwd: worker, stdio: 'inherit' })
  writeFileSync(`${worker}${file}`, `${readFileSync(`${worker}${file}`, 'utf8')}\n// Keep sibling deployment declarations module-local. Binding types above are generated.\nexport type { ${name} }\n`)
}
