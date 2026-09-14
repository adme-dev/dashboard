# Scoped business content administration

Recovered from the missing collection administration in historical PR519 onto current main `7b1f0edf5509dceb73d18f1a2cb69a4f5990af4f`, retaining current booking/font source. This is an isolated collection editor, not the standalone visual Studio editor.

Agency and portal websites expose Business content. The shared editor manages collections, records, review status and typed attributes. Editor membership can write; viewer membership can only read. Agency writes require PAGE_STUDIO_EDIT and respect read-only roles. Every operation freshly joins the active client, current website entitlement and full portal membership scope. All five scope axes are derived on the server. Historical static binding maps and global latest-Xero tenant selection are intentionally absent.

Only the private PAGE_STUDIO_CONTENT_ROUTER binding and an explicit staging/production PAGE_STUDIO_CONTENT_ENVIRONMENT are accepted. Production remains unconnected until the staged promotion gate; this PR changes no bindings. Missing or inactive routes report setup pending.

The API bounds observed JSON bytes to 512000, caps collection/record/attribute counts and validates every RPC response. Writes compare expectedRevision and require exact revision, actor, scope and content acknowledgement. Conflict preserves local edits and requires explicit reload. Saving prepares a content draft; it does not invoke a build, approve or publish. The editor uses existing reviewed-release controls separately.

Focused verification covers scoped membership revocation, inactive clients, entitlement expiry/association, forged authority, all five response-scope axes, receipt mismatches, bounded HTTP bodies and preservation of local edits. Disposable PostgreSQL tests run explicitly in CI. Production/browser acceptance and integration deployment are coordinated by the parent release owner.

Local verification on 14 September: 48 focused schema/API/CAS/inventory checks pass, including six actual disposable PostgreSQL authorization tests. The final content/booking/router/HTTP/inventory regression run passes 68 tests. Local Chrome acceptance at 1440×900 and 393×650 uses synthetic intercepted API responses and verifies typed fields, rejected stale save with draft retention, explicit reload, accepted save, viewer controls, narrow modal fit, scrolling and no page-width overflow or JavaScript errors. This browser check does not establish live router acceptance. Local test database and dev server were stopped after verification.
