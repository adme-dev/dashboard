# Client preview hostname identifier repair

## Failure and repair

Fantasy Limo's reserved preview address had no Cloudflare hostname mapping and no active snapshot. Two recorded staging attempts failed with HOST_UNAVAILABLE. Operational attachment through the authenticated Cloudflare CLI identity created the exact hostname on `xeroflow-page-studio-client-staging` in the verified xeroflow.io zone.

Cloudflare returned domain ID `34d9b1c173151b06f79935e65e911ecb52e8e3ec`. Both the provider adapter and coordinator incorrectly required exactly 32 hex characters. The shared domain-ID schema accepts 32–64 lowercase hex characters, while account and zone IDs remain exactly 32. Exact hostname, service, zone, certificate and read-back checks remain required.

## Verification

- Before the fix: provider and PostgreSQL activation regressions failed; 63 other tests passed.
- After the fix: 65 provider/database tests passed.
- 106 staging contract, endpoint, component, access and deployment-guard tests passed.
- Strict management Worker TypeScript, focused ESLint, diff checks and production-target dry-run passed.
- Independent reviewer read all four modified source/test files end-to-end: no actionable findings.
- Public DNS returned Cloudflare addresses. HTTPS well-known probe returned the exact staging service and hostname using the published address while the local resolver retained NXDOMAIN.
- Root still returns 404 until an authenticated staging update builds and activates a snapshot. This code fix is not proof of activation.

## Release boundary

Deploy the private management Worker from exact freshly fetched merged main using its guarded deployment script. This does not deploy the Dashboard Pages application or Robert's pending login-render fix. No database migration or production release-pointer modification is involved.

Live management-token access remains to be verified: historical-log access through the CLI was denied, and a live diagnostic capture is awaiting a new authenticated preview update. Do not claim that widening the ID validates that separate credential path.
