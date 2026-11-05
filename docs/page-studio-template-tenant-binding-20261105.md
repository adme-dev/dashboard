# Explicit Page Studio template organisation binding

The Automotive Templates account has saved Page Studio sites and entitlements,
but no Xero accounting connection. The catalogue resolver previously required an
`xero_org_connection` row and consequently refused every template action with403.

Pin `templateTenantId` in the existing server-owned customer activation bundle.
The strict activation schema accepts this optional UUID. Template authority uses
this deployment binding before its legacy accounting-organisation fallback.
Present malformed configuration fails closed; no browser parameter or cookie can
select this binding. Existing fresh login, role, tenant comparison, source
allowlist, exact checkpoint, preview and transaction authority remain enforced.
The isolated staging binding retains its existing behavior. No additional Worker
text binding is introduced, and no accounting credentials/connection are created.

Production read-only evidence confirmed Kia in the approved organisation and zero
accounting connection rows. Source change is not a claim of deployed browser
acceptance. No tests were run under the owner's instruction; necessary release
compilation and live account checks remain separate.
