import { z } from 'zod'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { PageStudioBusinessContentError } from './businessContent'
import { PageStudioHostnameSchema } from './delivery'

// Separate mandatory policy: unrelated forms may retain their optional CAPTCHA.
export const PUBLIC_FORM_TURNSTILE_ACTION = 'page_studio_public_form'
const endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const identitySchema = z.object({
  hostname: PageStudioHostnameSchema,
  clientAddress: z.union([z.ipv4(), z.ipv6()]),
  identityDigest: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()
const proofs = new WeakMap<object, { identity: string, verifiedAt: number, challengeDigest: string }>()
const denied = () => new PageStudioBusinessContentError('PUBLIC_FORM_CHALLENGE_REQUIRED', 422, 'Complete the website verification before submitting.')

/** Private-host input only. The coordinator derives the identity digest from the
 * exact publication/form/intent/input, and Delivery supplies the observed IP.
 * This network operation must finish before native SQL admission locks begin. */
export async function verifyPublicFormChallenge(
  rawIdentity: unknown,
  rawToken: unknown,
  env: Record<string, unknown>,
  dependencies: { fetch?: typeof globalThis.fetch } = {}
): Promise<object> {
  const identity = identitySchema.parse(rawIdentity)
  const token = z.string().min(1).max(2048).parse(rawToken)
  const secret = z.string().min(1).max(256).safeParse(env.PAGE_STUDIO_PUBLIC_FORM_TURNSTILE_SECRET)
  if (!secret.success) throw new PageStudioBusinessContentError('PUBLIC_FORM_CHALLENGE_UNAVAILABLE', 503, 'Website verification is unavailable.')
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      void reader?.cancel().catch(() => {})
      reject(denied())
    }, 5000)
  })
  try {
    return await Promise.race([deadline, (async () => {
      const response = await (dependencies.fetch ?? globalThis.fetch)(endpoint, {
        // workerd rejects 'error' before sending. Manual mode and the response
        // checks below prevent forwarding the token or secret to redirects.
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: secret.data, response: token, remoteip: identity.clientAddress, idempotency_key: crypto.randomUUID() })
      })
      if (!response.ok || response.redirected || !response.body) {
        await response.body?.cancel().catch(() => {})
        throw denied()
      }
      reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8', { fatal: true })
      let bytes = 0, raw = ''
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes > 16_384) throw denied()
          raw += decoder.decode(chunk.value, { stream: true })
        }
        raw += decoder.decode()
      } catch (error) {
        await reader.cancel().catch(() => {})
        throw error
      } finally { reader.releaseLock() }
      const result = z.object({ success: z.literal(true), hostname: z.string(), action: z.literal(PUBLIC_FORM_TURNSTILE_ACTION) }).parse(JSON.parse(raw))
      if (result.hostname !== identity.hostname || controller.signal.aborted) throw denied()
      const proof = Object.freeze({})
      proofs.set(proof, { identity: collectionCanonical(identity), verifiedAt: Date.now(), challengeDigest: await collectionDigest({ token }) })
      return proof
    })()])
  } catch {
    throw denied()
  } finally {
    clearTimeout(timer)
  }
}

/** Only a module-minted, recent, exact-intent proof reaches a new claim. Receipt
 * retries use their existing durable claim and never call this to redispatch. */
export function assertPublicFormChallenge(proof: object, rawIdentity: unknown): { challengeDigest: string } {
  const retained = proofs.get(proof)
  if (!retained || collectionCanonical(identitySchema.parse(rawIdentity)) !== retained.identity || Date.now() < retained.verifiedAt || Date.now() - retained.verifiedAt > 30_000) throw denied()
  return { challengeDigest: retained.challengeDigest }
}
