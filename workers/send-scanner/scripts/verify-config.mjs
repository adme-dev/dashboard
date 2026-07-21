import { readFileSync } from 'node:fs'

const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
const accountId = config.vars?.EXPECTED_R2_ACCOUNT_ID

if (typeof accountId !== 'string' || !/^[0-9a-f]{32}$/i.test(accountId)) {
  console.error('Scanner deployment blocked: configure and review EXPECTED_R2_ACCOUNT_ID first.')
  process.exitCode = 1
}
