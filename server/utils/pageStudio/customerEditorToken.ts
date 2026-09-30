import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose'
import { z } from 'zod'
import { createError } from 'h3'

export const CUSTOMER_EDITOR_TOKEN_TYPE = 'XEROFLOW-PAGE-STUDIO-CUSTOMER-SESSION'
export const CUSTOMER_EDITOR_AUDIENCE = 'xeroflow-page-studio-customer'
export const CUSTOMER_EDITOR_MAX_SECONDS = 4 * 60 * 60
export const CustomerEditorCapabilitySchema = z.enum(['workspace:create', 'workspace:reconnect', 'workspace:checkpoint',
  'workspace:preview', 'workspace:terminate', 'workspace:status'])
export const CustomerEditorOriginSchema = z.string().max(2048).refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password
  } catch { return false }
})
export const CustomerEditorClaimsSchema = z.object({
  role: z.literal('customer'), environment: z.literal('staging'), nonce: z.string().uuid(), userId: z.string().uuid(),
  workspaceId: z.string().uuid(), clientId: z.string().uuid(), siteId: z.string().uuid(),
  tenantId: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  capabilities: z.array(CustomerEditorCapabilitySchema).min(1).max(6).refine(values => new Set(values).size === values.length),
  issuedAt: z.number().int().positive(), expiresAt: z.number().int().positive(), editorOrigin: CustomerEditorOriginSchema,
  returnUrl: z.string().max(2080).refine((value) => {
    try {
      const url = new URL(value)
      return CustomerEditorOriginSchema.safeParse(url.origin).success && value === `${url.origin}/studio/dashboard`
    } catch { return false }
  })
}).strict().refine(value => value.expiresAt > value.issuedAt && value.expiresAt <= value.issuedAt + CUSTOMER_EDITOR_MAX_SECONDS)
export type CustomerEditorClaims = z.infer<typeof CustomerEditorClaimsSchema>
export type CustomerEditorCapability = z.infer<typeof CustomerEditorCapabilitySchema>
const invalid = () => createError({ statusCode: 401, statusMessage: 'Customer editor session is invalid or expired.' })

export async function signCustomerEditorToken(input: CustomerEditorClaims, privatePem: string, issuer: string) {
  const claims = CustomerEditorClaimsSchema.parse(input)
  CustomerEditorOriginSchema.parse(issuer)
  const key = await importPKCS8(privatePem, 'ES256')
  return new SignJWT(claims).setProtectedHeader({ alg: 'ES256', typ: CUSTOMER_EDITOR_TOKEN_TYPE })
    .setIssuer(issuer).setAudience(CUSTOMER_EDITOR_AUDIENCE).setSubject(claims.userId).setJti(claims.nonce)
    .setIssuedAt(claims.issuedAt).setExpirationTime(claims.expiresAt).sign(key)
}
export async function verifyCustomerEditorToken(token: string, publicPem: string, issuer: string, currentDate = new Date()): Promise<CustomerEditorClaims> {
  try {
    if (!token || token.length > 8192 || !CustomerEditorOriginSchema.safeParse(issuer).success) throw invalid()
    const key = await importSPKI(publicPem, 'ES256')
    const { payload } = await jwtVerify(token, key, { algorithms: ['ES256'], typ: CUSTOMER_EDITOR_TOKEN_TYPE,
      audience: CUSTOMER_EDITOR_AUDIENCE, issuer, currentDate, maxTokenAge: CUSTOMER_EDITOR_MAX_SECONDS,
      requiredClaims: ['exp', 'iat', 'jti', 'sub'] })
    const { iss: _iss, aud: _aud, sub, jti, iat, exp, ...custom } = payload
    const claims = CustomerEditorClaimsSchema.parse(custom)
    if (sub !== claims.userId || jti !== claims.nonce || iat !== claims.issuedAt || exp !== claims.expiresAt
      || claims.issuedAt > Math.floor(currentDate.getTime() / 1000)) throw invalid()
    return claims
  } catch { throw invalid() }
}
