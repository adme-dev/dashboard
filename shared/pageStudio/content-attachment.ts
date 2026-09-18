import { z } from "zod";

// Mirrored in Dashboard shared/pageStudio/content-attachment.ts. Keep the wire
// contract and golden fixtures identical until a shared package is distributed.
const ScopedId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/);
const OperationId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Scope = z
  .object({
    businessId: ScopedId,
    clientId: ScopedId,
    environment: z.enum(["preview", "staging", "production"]),
    siteId: z.union([
      z
        .string()
        .min(3)
        .max(64)
        .regex(/^[a-z][a-z0-9_-]*$/),
      z.string().uuid(),
    ]),
    tenantId: ScopedId,
  })
  .strict();

/** Private server-derived intent, not an access grant or a setup job. */
export const ContentAttachmentRequestSchema = z
  .object({
    actor: z
      .object({
        kind: z.enum(["client-user", "agency-user"]),
        loginSessionHash: Digest,
        userId: z.string().uuid(),
      })
      .strict(),
    anchor: z.object({ checkpointId: OperationId, digest: Digest }).strict(),
    mode: z.literal("attach-existing-content"),
    operationId: OperationId,
    policyVersion: OperationId,
    runtimeDigest: Digest,
    schemaDigest: Digest,
    scope: Scope,
    version: z.literal(1),
  })
  .strict();

export type ContentAttachmentRequest = z.infer<
  typeof ContentAttachmentRequestSchema
>;

function scopeIdentity(scope: ContentAttachmentRequest["scope"]) {
  return [
    scope.tenantId,
    scope.clientId,
    scope.businessId,
    scope.siteId,
    scope.environment,
  ];
}

/** Caller must obtain expectedScope from native site/action authorization. */
export function parseContentAttachmentRequest(
  input: unknown,
  expectedScope: unknown
) {
  const request = ContentAttachmentRequestSchema.parse(input);
  const scope = Scope.parse(expectedScope);
  if (
    JSON.stringify(scopeIdentity(request.scope)) !==
    JSON.stringify(scopeIdentity(scope))
  ) {
    throw new Error("Attachment scope mismatch");
  }
  return request;
}

// Versioned tuple: explicit ordering avoids JSON property-order dependence.
// Every immutable request field participates; none is defaulted or trimmed.
function identityBytes(request: ContentAttachmentRequest) {
  return JSON.stringify([
    request.version,
    request.mode,
    request.operationId,
    scopeIdentity(request.scope),
    [request.actor.kind, request.actor.userId, request.actor.loginSessionHash],
    [request.anchor.checkpointId, request.anchor.digest],
    request.schemaDigest,
    request.runtimeDigest,
    request.policyVersion,
  ]);
}

/** Deterministic operation identity only. Never authorizes resources or effects. */
export async function contentAttachmentIdentity(
  input: unknown
): Promise<string> {
  const request = ContentAttachmentRequestSchema.parse(input);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identityBytes(request))
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `cms_attach_${hex}`;
}

/** Retry reconciliation must not adopt a different login, anchor or policy. */
export function requireMatchingContentAttachmentRequest(
  retained: unknown,
  expected: unknown
) {
  const actual = ContentAttachmentRequestSchema.parse(retained);
  const candidate = ContentAttachmentRequestSchema.parse(expected);
  if (identityBytes(actual) !== identityBytes(candidate)) {
    throw new Error("Attachment request changed");
  }
  return actual;
}
