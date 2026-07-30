import { canonicalizeCrmEmailDomain } from '~~/server/utils/crm/emailReplyToken'

const SECRET_VERSION_PATTERN = /^[1-9]\d{0,5}$/
const MIN_SECRET_BYTES = 32
const textEncoder = new TextEncoder()

export interface CrmEmailRouteIssuanceConfig {
  currentVersion: number
  domain: string
  secret: string
}

function unsafeConfiguration(): Error {
  return new Error('CRM email reply secrets are not configured safely')
}

function unsafeIssuanceConfiguration(): Error {
  return new Error('CRM email route issuance is not configured safely')
}

export function parseCrmEmailReplySecrets(
  value: string | undefined
): Readonly<Record<number, string>> {
  if (!value?.trim()) throw unsafeConfiguration()

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw unsafeConfiguration()
  }

  if (
    !parsed
    || typeof parsed !== 'object'
    || Array.isArray(parsed)
  ) {
    throw unsafeConfiguration()
  }

  const entries = Object.entries(parsed)
  if (entries.length === 0) throw unsafeConfiguration()

  const secrets: Record<number, string> = {}
  for (const [versionValue, secret] of entries) {
    if (
      !SECRET_VERSION_PATTERN.test(versionValue)
      || typeof secret !== 'string'
      || textEncoder.encode(secret).byteLength < MIN_SECRET_BYTES
    ) {
      throw unsafeConfiguration()
    }

    const version = Number(versionValue)
    if (version > 999_999) throw unsafeConfiguration()
    secrets[version] = secret
  }

  return Object.freeze(secrets)
}

export function parseCrmEmailRouteIssuanceConfig(input: {
  secrets: string | undefined
  currentVersion: string | undefined
  domain: string | undefined
}): CrmEmailRouteIssuanceConfig {
  try {
    if (!input.currentVersion || !SECRET_VERSION_PATTERN.test(input.currentVersion)) {
      throw unsafeIssuanceConfiguration()
    }

    const currentVersion = Number(input.currentVersion)
    const secrets = parseCrmEmailReplySecrets(input.secrets)
    const secret = secrets[currentVersion]
    if (!secret) throw unsafeIssuanceConfiguration()

    return {
      currentVersion,
      domain: canonicalizeCrmEmailDomain(input.domain ?? ''),
      secret
    }
  } catch {
    throw unsafeIssuanceConfiguration()
  }
}
