interface ClientPortalAccessRequestOptions {
  method: 'POST'
  body: { clientId: string }
  headers: { 'Idempotency-Key': string }
}

export function createClientPortalAccessRequest(
  clientId: string,
  createId: () => string = () => crypto.randomUUID()
): ClientPortalAccessRequestOptions {
  return {
    method: 'POST',
    body: { clientId },
    headers: {
      'Idempotency-Key': `portal-access:${createId()}`
    }
  }
}
