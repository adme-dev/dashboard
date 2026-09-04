#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 15_000

function required(env, name) {
  const value = String(env[name] ?? '').trim()
  if (!value) throw new Error(`Missing required ${name}`)
  return value
}

function parseBaseUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('MEASUREMENT_BASE_URL must be an absolute HTTP(S) URL')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('MEASUREMENT_BASE_URL must be an absolute HTTP(S) URL without credentials')
  }
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/$/, '')
  return url
}

function loadAuthHeader(filePath) {
  const mode = statSync(filePath).mode & 0o777
  if (process.platform !== 'win32' && (mode & 0o077) !== 0) {
    throw new Error('MEASUREMENT_AUTH_FILE must be readable only by its owner (chmod 600)')
  }

  let parsed
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    throw new Error('MEASUREMENT_AUTH_FILE must contain valid JSON')
  }

  const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : []
  if (keys.length !== 1 || !['cookie', 'authorization'].includes(keys[0])) {
    throw new Error('MEASUREMENT_AUTH_FILE must contain exactly one cookie or authorization field')
  }
  const value = String(parsed[keys[0]] ?? '').trim()
  if (value.length < 12 || /[\r\n]/.test(value)) {
    throw new Error('MEASUREMENT_AUTH_FILE contains an invalid authentication value')
  }
  if (keys[0] === 'authorization' && !/^Bearer\s+\S+$/i.test(value)) {
    throw new Error('The authorization field must use the Bearer scheme')
  }
  return keys[0] === 'cookie' ? { Cookie: value } : { Authorization: value }
}

export function resolveConfig(env = process.env) {
  const clientId = required(env, 'MEASUREMENT_CLIENT_ID')
  if (!UUID_PATTERN.test(clientId)) throw new Error('MEASUREMENT_CLIENT_ID must be a UUID')

  return {
    baseUrl: parseBaseUrl(required(env, 'MEASUREMENT_BASE_URL')),
    clientId,
    authHeader: loadAuthHeader(required(env, 'MEASUREMENT_AUTH_FILE'))
  }
}

async function fetchJson(fetchImpl, url, authHeader, label) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      headers: { Accept: 'application/json', ...authHeader },
      signal: controller.signal
    })
  } catch {
    throw new Error(`${label} request failed before a response`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) throw new Error(`${label} request returned HTTP ${response.status}`)
  try {
    return await response.json()
  } catch {
    throw new Error(`${label} response was not valid JSON`)
  }
}

function asNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function latestEvidenceAt(destination) {
  const values = [
    destination?.lastSuccessAt,
    destination?.lastValidatedAt,
    ...(Array.isArray(destination?.capabilities)
      ? destination.capabilities.map(capability => capability?.evidenceAt)
      : [])
  ]
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(Number.isFinite)
  return values.length ? Math.max(...values) : null
}

function inspectRedaction(value, path = [], findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectRedaction(item, [...path, String(index)], findings))
    return findings
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      if (/\bBearer\s+[A-Za-z0-9._~-]{8,}/i.test(value)) findings.push('bearer value')
      if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) findings.push('email value')
      if (/(?:\+?61|0)4(?:[\s-]?\d){8}\b/.test(value)) findings.push('phone value')
    }
    return findings
  }

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...path, key]
    const aggregateCoverageKey = path.at(-1) === 'identifierCoverage'
      && ['ttclid', 'ttp', 'fbc', 'fbp', 'gclid', 'gbraid', 'wbraid'].includes(key)
      && asNonNegativeInteger(nested) !== null
    if (
      !aggregateCoverageKey
      && /^(?:credentialRef|accessToken|refreshToken|cookie|authorization|email|phone|clientUserAgent|eventSourceUrl|ttclid|ttp|fbc|fbp|gclid|gbraid|wbraid)$/i.test(key)
    ) findings.push(nextPath.join('.'))
    inspectRedaction(nested, nextPath, findings)
  }
  return findings
}

function checkConsent(summary, now) {
  const captured = asNonNegativeInteger(summary?.captured)
  const consentGranted = asNonNegativeInteger(summary?.consentGranted)
  const freshnessAt = summary?.freshnessAt ? new Date(summary.freshnessAt).getTime() : Number.NaN
  const freshnessAge = now.getTime() - freshnessAt
  const identifierCoverage = summary?.identifierCoverage
  const tiktokCoverage = (
    asNonNegativeInteger(identifierCoverage?.ttclid) ?? 0
  ) + (
    asNonNegativeInteger(identifierCoverage?.ttp) ?? 0
  )
  return {
    key: 'consentGranted',
    ok: captured !== null && captured > 0
      && consentGranted !== null && consentGranted > 0
      && consentGranted <= captured
      && tiktokCoverage > 0
      && Number.isFinite(freshnessAge)
      && freshnessAge >= 0
      && freshnessAge <= MAX_EVIDENCE_AGE_MS,
    detail: `captured=${captured ?? 'invalid'}, consent-granted=${consentGranted ?? 'invalid'}, TikTok-context=${tiktokCoverage}, evidence-fresh=${Number.isFinite(freshnessAge) && freshnessAge >= 0 && freshnessAge <= MAX_EVIDENCE_AGE_MS}`
  }
}

function checkConfirmedConversions(summary, lineage) {
  const confirmed = asNonNegativeInteger(summary?.confirmed)
  const confirmedItems = Array.isArray(lineage?.items)
    ? lineage.items.filter(item => item?.eventName === 'lead_created')
    : []
  return {
    key: 'confirmedConversions',
    ok: confirmed !== null
      && confirmed > 0
      && confirmedItems.some(item => item?.consentState === 'granted'),
    detail: `confirmed-total=${confirmed ?? 'invalid'}, sampled-confirmed=${confirmedItems.length}`
  }
}

function checkDeduplication(lineage) {
  const items = Array.isArray(lineage?.items) ? lineage.items : []
  const seen = new Set()
  const receipts = new Set()
  let duplicateDelivery = false
  let duplicateReceipt = false

  for (const item of items) {
    if (item?.eventName !== 'lead_created') continue
    const destinationKey = item.destination?.id ?? 'canonical'
    const deliveryKey = `${item.eventId}:${destinationKey}`
    if (seen.has(deliveryKey)) duplicateDelivery = true
    seen.add(deliveryKey)
    if (item.receiptId) {
      if (receipts.has(item.receiptId)) duplicateReceipt = true
      receipts.add(item.receiptId)
    }
  }

  return {
    key: 'deduplication',
    ok: seen.size > 0 && !duplicateDelivery && !duplicateReceipt,
    detail: `sampled-unique-deliveries=${seen.size}, duplicate-delivery=${duplicateDelivery}, duplicate-receipt=${duplicateReceipt}`
  }
}

function checkDestinationHealth(readiness, destinations, now) {
  const profile = readiness?.profile ?? {}
  const items = Array.isArray(destinations?.items) ? destinations.items : []
  const tiktok = items.filter(destination => destination?.platform === 'tiktok')
  const valid = tiktok.filter((destination) => {
    const evidenceAt = latestEvidenceAt(destination)
    const evidenceAge = evidenceAt === null ? Number.POSITIVE_INFINITY : now.getTime() - evidenceAt
    const eventsApi = Array.isArray(destination.capabilities)
      && destination.capabilities.some(capability => (
        capability?.mode === 'tiktok_events_api' && capability?.status === 'ready'
      ))
    return profile.environment === 'test'
      && destination.environment === 'test'
      && destination.enabled === false
      && destination.healthStatus === 'ready'
      && eventsApi
      && evidenceAge >= 0
      && evidenceAge <= MAX_EVIDENCE_AGE_MS
  })

  return {
    key: 'destinationHealth',
    ok: tiktok.length === 1 && valid.length === 1,
    detail: `TikTok-destinations=${tiktok.length}, fresh-ready-test-destinations=${valid.length}`
  }
}

function checkRedaction(responses) {
  const findings = inspectRedaction(responses)
  return {
    key: 'redaction',
    ok: findings.length === 0,
    detail: findings.length === 0 ? 'no raw identifier or credential fields detected' : `unsafe-fields=${findings.length}`
  }
}

export function evaluateReadiness({ summary, readiness, destinations, lineage }, now = new Date()) {
  return [
    checkConsent(summary, now),
    checkConfirmedConversions(summary, lineage),
    checkDeduplication(lineage),
    checkDestinationHealth(readiness, destinations, now),
    checkRedaction({ summary, readiness, destinations, lineage })
  ]
}

export async function runReadiness({ config, fetchImpl = fetch, now = new Date() }) {
  const clientBase = new URL(`/api/agency/measurement/clients/${config.clientId}/`, config.baseUrl)
  const summaryUrl = new URL('signals/summary', clientBase)
  const readinessUrl = new URL('readiness', clientBase)
  const destinationsUrl = new URL('destinations', clientBase)
  destinationsUrl.searchParams.set('platform', 'tiktok')
  destinationsUrl.searchParams.set('pageSize', '10')
  const lineageUrl = new URL('signals', clientBase)
  lineageUrl.searchParams.set('eventName', 'lead_created')
  lineageUrl.searchParams.set('from', new Date(now.getTime() - MAX_EVIDENCE_AGE_MS).toISOString())
  lineageUrl.searchParams.set('to', now.toISOString())
  lineageUrl.searchParams.set('limit', '100')

  const [summary, readiness, destinations, lineage] = await Promise.all([
    fetchJson(fetchImpl, summaryUrl, config.authHeader, 'signal summary'),
    fetchJson(fetchImpl, readinessUrl, config.authHeader, 'readiness'),
    fetchJson(fetchImpl, destinationsUrl, config.authHeader, 'destination health'),
    fetchJson(fetchImpl, lineageUrl, config.authHeader, 'event lineage')
  ])
  return evaluateReadiness({ summary, readiness, destinations, lineage }, now)
}

function printResults(results) {
  for (const result of results) {
    process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'} ${result.key}: ${result.detail}\n`)
  }
}

async function main() {
  let config
  try {
    config = resolveConfig()
  } catch (error) {
    process.stderr.write(`FAIL configuration: ${error instanceof Error ? error.message : 'invalid configuration'}\n`)
    process.exitCode = 2
    return
  }

  try {
    const results = await runReadiness({ config })
    printResults(results)
    process.exitCode = results.every(result => result.ok) ? 0 : 1
  } catch (error) {
    process.stderr.write(`FAIL readiness: ${error instanceof Error ? error.message : 'verification failed'}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
