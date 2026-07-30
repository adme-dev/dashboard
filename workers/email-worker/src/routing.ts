export type InboundEmailRoute
  = | { kind: 'board', token: string }
    | { kind: 'lead', token: string }
    | { kind: 'crm_reply', token: string }
    | { kind: 'invalid' }

const BOARD_ROUTE_PATTERN = /^board-([A-Za-z0-9_-]{8,32})$/
const SIGNED_ROUTE_PATTERN
  = /^v[1-9]\d{0,5}\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/

export function classifyInboundEmailRoute(recipient: string): InboundEmailRoute {
  if (
    typeof recipient !== 'string'
    || recipient.length < 3
    || recipient.length > 384
    || /\s|[<>]/.test(recipient)
  ) {
    return { kind: 'invalid' }
  }

  const parts = recipient.split('@')
  if (parts.length !== 2) return { kind: 'invalid' }
  const [localPart, domain] = parts
  if (!localPart || localPart.length > 128 || !domain || domain.length > 253) {
    return { kind: 'invalid' }
  }

  const boardMatch = BOARD_ROUTE_PATTERN.exec(localPart)
  if (boardMatch?.[1]) {
    return { kind: 'board', token: boardMatch[1] }
  }

  for (const [prefix, kind] of [
    ['lead+', 'lead'],
    ['reply+', 'crm_reply']
  ] as const) {
    if (!localPart.startsWith(prefix)) continue
    const token = localPart.slice(prefix.length)
    return SIGNED_ROUTE_PATTERN.test(token)
      ? { kind, token }
      : { kind: 'invalid' }
  }

  return { kind: 'invalid' }
}
