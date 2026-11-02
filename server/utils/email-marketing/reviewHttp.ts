// HTTP boundary for M06 review routes: flag gate, session token, strict body
// and fresh stored authority. Review authority (approve / request changes) is
// the agency ADMIN|MANAGEMENT + CREATIVE publisher check, independent of the
// client-scoped staff/designer content grants used for comments and submit.
import { createError, getCookie, getHeader, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { validateSession } from '~~/server/utils/auth'
import { assertFreshDesignAccess, assertFreshDesignPublisher } from './designAccess'
import { isEmailReviewWorkflowEnabled, type ReviewAuthorizer, type ReviewCommandInput, type ReviewTargetKind } from './review'
import { REVIEW_LIMITS } from '../../../shared/emailRendering/reviewBlocks'

export interface ReviewSession {
  token: string
  userId: string
}

export function reviewEnv(event: H3Event): Record<string, unknown> {
  return ((event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env) ?? {}
}

export function assertReviewWorkflowEnabled(event: H3Event): void {
  setHeader(event, 'cache-control', 'no-store')
  if (!isEmailReviewWorkflowEnabled(reviewEnv(event))) throw createError({ statusCode: 404, statusMessage: 'not_found' })
}

/** The token comes only from the authenticated HTTP boundary, never from JSON. */
export async function requireReviewSession(event: H3Event): Promise<ReviewSession> {
  const authorization = getHeader(event, 'authorization')
  const token = getCookie(event, 'auth_token')
    || getCookie(event, 'auth_token_client')
    || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
  const user = token ? await validateSession(token) : null
  if (!user || !token) throw createError({ statusCode: 401, statusMessage: 'review_session_invalid' })
  return { token, userId: user.id }
}

export function reviewAuthorizer(session: ReviewSession): ReviewAuthorizer {
  return async (authority, clientId) => {
    if (authority === 'review') return assertFreshDesignPublisher(session.token, session.userId, clientId)
    await assertFreshDesignAccess(session.token, session.userId, clientId, authority === 'read' ? 'read' : 'write')
  }
}

export const ReviewKind = z.enum(['template', 'campaign'])
const Uuid = z.string().uuid()
const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Common = {
  version: z.literal(1),
  operationId: Uuid,
  scope: z.object({ clientId: Uuid.nullable() }).strict(),
  expectedVersion: z.number().int().min(0).max(2_147_483_647),
  expectedContentDigest: Digest
}

export const ReviewCommandBody = z.discriminatedUnion('command', [
  z.object({
    ...Common,
    command: z.literal('comment'),
    blockId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).nullable(),
    parentId: Uuid.nullable(),
    body: z.string().min(1).max(REVIEW_LIMITS.commentChars)
  }).strict(),
  z.object({ ...Common, command: z.literal('resolve_comment'), commentId: Uuid, resolved: z.boolean() }).strict(),
  z.object({ ...Common, command: z.literal('submit') }).strict(),
  z.object({ ...Common, command: z.literal('approve') }).strict(),
  z.object({ ...Common, command: z.literal('request_changes'), note: z.string().min(1).max(REVIEW_LIMITS.noteChars) }).strict(),
  z.object({ ...Common, command: z.literal('require_review') }).strict()
])
export type ReviewCommandBodyInput = z.infer<typeof ReviewCommandBody>

export function toReviewCommandInput(
  session: ReviewSession,
  kind: ReviewTargetKind,
  targetId: string,
  body: ReviewCommandBodyInput
): ReviewCommandInput {
  const { version: _version, operationId, scope, expectedVersion, expectedContentDigest, ...command } = body
  return {
    actorId: session.userId,
    operationId,
    kind,
    targetId,
    expectedClientId: scope.clientId,
    expectedVersion,
    expectedContentDigest,
    payload: command as ReviewCommandInput['payload']
  }
}
