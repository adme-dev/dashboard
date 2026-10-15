import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose'
import { z } from 'zod'
import { createError } from 'h3'

export const CUSTOMER_PREVIEW_TOKEN_TYPE = 'XEROFLOW-CUSTOMER-RELEASE-PREVIEW'
export const CUSTOMER_PREVIEW_AUDIENCE = 'xeroflow-customer-release-preview'
export const CustomerPreviewClaimsSchema = z.object({
  role: z.literal('customer'), environment: z.literal('production'), purpose: z.literal('release-preview'),
  nonce: z.uuid(), userId: z.uuid(), workspaceId: z.uuid(), clientId: z.uuid(), siteId: z.uuid(), releaseId: z.uuid(),
  tenantId: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  hostname: z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
  issuedAt: z.number().int().positive(), expiresAt: z.number().int().positive()
}).strict().refine(value => value.expiresAt > value.issuedAt && value.expiresAt <= value.issuedAt + 300)
export type CustomerPreviewClaims = z.infer<typeof CustomerPreviewClaimsSchema>
const validIssuer = (issuer: string) => {
  try {
    const url = new URL(issuer)
    return url.protocol === 'https:' && url.origin === issuer && !url.username && !url.password
  } catch { return false }
}
const invalid = () => createError({ statusCode: 401, statusMessage: 'Customer preview credential is invalid or expired.' })

export async function signCustomerPreviewToken(input: CustomerPreviewClaims, privatePem: string, issuer: string) {
  const claims = CustomerPreviewClaimsSchema.parse(input)
  if (!validIssuer(issuer)) throw invalid()
  return new SignJWT(claims).setProtectedHeader({ alg: 'ES256', typ: CUSTOMER_PREVIEW_TOKEN_TYPE })
    .setIssuer(issuer).setAudience(CUSTOMER_PREVIEW_AUDIENCE).setSubject(claims.userId).setJti(claims.nonce)
    .setIssuedAt(claims.issuedAt).setExpirationTime(claims.expiresAt).sign(await importPKCS8(privatePem, 'ES256'))
}

export async function verifyCustomerPreviewToken(token: string, publicPem: string, issuer: string, currentDate = new Date()): Promise<CustomerPreviewClaims> {
  try {
    if (!token || token.length > 8192 || !validIssuer(issuer)) throw invalid()
    const { payload } = await jwtVerify(token, await importSPKI(publicPem, 'ES256'), {
      algorithms: ['ES256'], typ: CUSTOMER_PREVIEW_TOKEN_TYPE, audience: CUSTOMER_PREVIEW_AUDIENCE,
      issuer, currentDate, maxTokenAge: 300, requiredClaims: ['exp', 'iat', 'jti', 'sub']
    })
    const { iss: _iss, aud: _aud, sub, jti, iat, exp, ...custom } = payload
    const claims = CustomerPreviewClaimsSchema.parse(custom)
    if (sub !== claims.userId || jti !== claims.nonce || iat !== claims.issuedAt || exp !== claims.expiresAt
      || claims.issuedAt > Math.floor(currentDate.getTime() / 1000)) throw invalid()
    return claims
  } catch { throw invalid() }
}
