#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

const CONFIG_PATH = process.argv[2] || 'wrangler.toml'
const SECRET_ENV = 'AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET'
const HASH_VAR = 'AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256'

function option(value) {
  return String(value ?? '').trim()
}

function hashSecret(secret) {
  return createHash('sha256').update(secret).digest('hex')
}

export function syncSmokeVerifierToml(source, secret) {
  const cleanSecret = option(secret)
  if (!cleanSecret) return { updated: false, toml: source }

  const hash = hashSecret(cleanSecret)
  const assignment = `${HASH_VAR} = "${hash}"`
  const existingPattern = new RegExp(`^${HASH_VAR}\\s*=\\s*"[^"]*"`, 'm')

  if (existingPattern.test(source)) {
    return {
      updated: true,
      toml: source.replace(existingPattern, assignment)
    }
  }

  const enabledPattern = /^AGENCY_WORKFLOWS_ENABLED\s*=\s*"true"$/m
  if (!enabledPattern.test(source)) {
    throw new Error(`Cannot insert ${HASH_VAR}: AGENCY_WORKFLOWS_ENABLED marker was not found.`)
  }

  return {
    updated: true,
    toml: source.replace(enabledPattern, `$&\n${assignment}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const secret = option(process.env[SECRET_ENV])
  if (!secret) {
    console.log(`SKIP ${SECRET_ENV} is not configured; ${HASH_VAR} unchanged.`)
    process.exit(0)
  }

  const source = readFileSync(CONFIG_PATH, 'utf8')
  const result = syncSmokeVerifierToml(source, secret)
  if (result.updated) {
    writeFileSync(CONFIG_PATH, result.toml)
    if (process.env.GITHUB_ENV) {
      appendFileSync(process.env.GITHUB_ENV, `${HASH_VAR}=${hashSecret(secret)}\n`)
    }
    console.log(`${HASH_VAR} synced from ${SECRET_ENV}.`)
  }
}
