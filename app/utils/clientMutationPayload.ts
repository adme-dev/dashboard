/** Client billing terms use CLIENTS; Xero binding remains company Finance-only. */
export function buildClientMutationPayload(body: Record<string, unknown>, clients: boolean, finance = false, restricted = false): Record<string, unknown> {
  if (clients && !restricted) return Object.fromEntries(Object.entries(body).filter(([key]) => finance || key !== 'xeroContactId'))
  const metadata = new Set(['name', 'contactEmail', 'contactPhone', 'reportingTimezone'])
  return Object.fromEntries(Object.entries(body).filter(([key]) => metadata.has(key)))
}
