import { createError } from 'h3'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { readCmsJsonBody } from './cmsObjectTransport'

/** Private callers supply fixed URL/error constants; no public request selects a destination. */
export async function placedAuthorityFetch<T>(binding: unknown, url: string, input: T, message: string) {
  const fail = (statusCode = 503) => createError({ statusCode, statusMessage: message })
  const service = binding as { fetch?: (request: Request) => Promise<Response> } | undefined
  if (typeof service?.fetch !== 'function') throw fail()
  const call = service.fetch.bind(service), request = structuredClone(input), body = JSON.stringify(request)
  if (new TextEncoder().encode(body).byteLength > 16384) throw fail()
  const digest = await collectionDigest(request)
  let response: Response, value: unknown
  try {
    response = await call(new Request(url, { method: 'POST', body, redirect: 'manual', headers: { 'content-type': 'application/json' } }))
    if (!(response instanceof Response) || response.headers.get('x-request-digest') !== digest) throw fail()
    value = await readCmsJsonBody(response, 16384, false)
  } catch { throw fail() }
  if (response.status !== 200) throw fail([400, 401, 403, 409, 503].includes(response.status) && value === message ? response.status : 503)
  return { request, value }
}
