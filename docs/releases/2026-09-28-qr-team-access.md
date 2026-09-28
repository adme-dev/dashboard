# QR access for creative production and marketing

Active members of the existing Marketing Team (`00000000-0000-0000-0000-000000000003`) and Production Team (`00000000-0000-0000-0000-000000000004`, the creative-production team) receive access to the agency QR library and campaigns. Read-only users remain excluded. Names, job titles and free-text departments do not confer access.

An explicit `QR_CODES` custom-role permission is also available. This permission does not confer advertising, finance, administration or competition-entry access. Existing media-only access retains client assignment restrictions. The QR client picker returns only active client IDs and names.

Team-derived authority is read freshly on each request and is not written into the general role cache. Removing membership immediately revokes the derived grant. Mutating either permission-bearing team's membership or deleting the team now requires admin/owner authority. PostgreSQL's noncanonical UUID aliases are rejected before the gate.

No production database or user-role update is needed. Read-only inspection confirmed the requested existing Member is already in Production Team.

## Verification

- 270 QR, competition-detail, role-resolver and authentication tests passed; an additional authentication regression verifies QR-only grants do not reverse-map to advertising, finance or admin authority.
- New files lint clean. Changed pre-existing files have no new lint diagnostics compared with HEAD (1,008 baseline diagnostics, 1,004 current before the additional test).
- Production build passed: raw Worker size 25,369,996 bytes against 25,468,928; gzip 6,806,453 against 9,750,000.
- Full typecheck retains existing failures. The changed-file errors are existing admin page click handlers; new QR permission files have none. This is not a globally green typecheck.
- Chrome local acceptance against the isolated staging database: a synthetic Member with Production Team membership saw QR navigation, selected the synthetic client, and created a QR code successfully. No production client or code was changed.
- Native API acceptance: the same session received QR 403 and `qrCodeAccess: false` immediately after membership removal; its general permission groups stayed empty. The test actor was deactivated, sessions revoked, and the synthetic code deactivated afterward.
- The existing `import.meta.dev` bypass in `requireRole` prevents dev-mode negative acceptance of legacy competition/tracking gates. Their unchanged production authority and the QR-only reverse-map regression were reviewed/tested separately; dev-mode denial is not claimed.
- Independent review covered authority, scopes, cache isolation, imports, navigation and marketing copy.

## Release and rollback

Merge from freshly fetched main, run `pnpm deploy:check`, then use only `pnpm deploy:production` for `agency-dashboard`. Record source SHA, main SHA and deployment ID in the release ledger after Cloudflare readback. Verify the live QR creator and the requested user's qualifying membership.

If access regresses, revert this change on current main and redeploy using the guarded command. There is no schema migration or irreversible customer-data change to roll back.
