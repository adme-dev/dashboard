/** Capture before awaits. Cloudflare RPC stubs interpret `.bind` and `.call`
 * as remote method names; Reflect.apply also preserves ordinary JS receivers.
 * No retry or fallback: a lost acknowledgement belongs to the saved operation. */
export function capturePageStudioRpcMethod(service: Record<string, unknown> | undefined, name: string) {
  const method = service?.[name]
  return typeof method === 'function'
    ? (...args: unknown[]): Promise<unknown> => Reflect.apply(method, service, args)
    : null
}
