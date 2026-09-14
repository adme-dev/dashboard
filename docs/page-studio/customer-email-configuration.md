# Website email preferences and delivery readiness

This slice adds agency and customer portal email settings at `/{agency|portal}/page-studio/:siteId/email`, linked from each website card. It saves sender name/address, reply-to address, a team notification inbox and optional paired incoming/forwarding addresses. It does not send mail, call a provider, change DNS, create mailboxes or activate forwarding. Existing portal authentication email transport is unchanged.

## Authority and persistence

Four GET/PUT routes under `/api/{agency|portal}/page-studio/sites/:siteId/email` use normal authenticated identities and private, no-store responses. Agency viewing/editing requires the existing Page Studio VIEW/EDIT permissions. The transaction rechecks and locks the active staff identity, current configured role and permission rows; custom-role misses deny access. System-role fallback follows the existing static permission policy only when no configured system role exists. Portal users need current active client membership and website membership; only current administrators/managers with editor membership can save. Viewer access is read-only. Both audiences require an active client, draft/active site, exact joined entitlement and an effective trial/active access period.

Environment comes exclusively from the trusted `PAGE_STUDIO_RELEASE_ENVIRONMENT` binding (`staging` or `production`). Client body/query fields cannot choose it. Unknown or missing environment fails closed. Generic authentication email bindings are not website sender verification.

Migration **418_page_studio_email_configuration.sql** adds one private JSONB column to `page_studio_sites`, constrained to staging/production objects. Runtime validation strictly limits each record to revision, settings, update time and actor. Writes lock the scoped rows, compare the expected revision and store only the selected environment. A redacted audit with environment and revision is written in the same transaction; an audit failure rolls back the settings. Competing or lost-acknowledgement retries cannot silently overwrite a newer revision. The UI keeps edits on failure and requires explicit reload before further saves.

The column is separate from `integrations`: the existing migration 414 release-metadata trigger replaces integrations on activation/restoration, while preserving this new column. Settings are not added to public manifests or normal site projections.

## Readiness boundaries

The response always reports `sendingEnabled: false`, `forwardingEnabled: false` and `senderVerification: unverified`. With no saved preferences its status is `not_configured`; with preferences it is `setup_required`. There is no client-writable readiness or verification flag. No provider API key, token or routing credential is collected.

Before delivery can be enabled, a separate reviewed implementation must supply scoped provider verification, domain/sender ownership evidence, safe outbound delivery and suppression handling, authenticated provider events and accountable retries. Incoming forwarding additionally needs a verified destination and an approved routing change. Customer inputs needed are the desired domain, existing mail provider and MX records, approved sender/reply-to addresses, receiving inbox and notification types. Existing mailboxes and DNS must be preserved until those changes are reviewed.

## Migration and release status

Migration 418 is reserved for this change. It has been applied only to a disposable local PostgreSQL test schema. **No staging or production database has been migrated by this task.** The parent agent must identify and review exact database targets before additive migration execution and code release. Until then a missing column returns a safe setup-pending 503.

This is a local review candidate, not a deployed feature. It started at Dashboard main `52ed8304f310cc2057218f872f559d173993792a`; it has been reconciled onto main `95c835f84864fcd64b9694393b076b2597a50b40`, including fresh staff authentication. Future integration must still include the latest main before PR/release checks. The parent owns domain verification, authentication changes and release coordination.

Meaningful coverage includes strict input and forged-readiness rejection, HTTP identity/body bounds, portal/staff revocation, environment isolation, concurrent compare-and-swap, audit rollback, additive migration replay and preservation through the actual release-metadata trigger. The dedicated disposable PostgreSQL suite is included in the existing CI content/bookings database step using `PAGE_STUDIO_EMAIL_DATABASE_TEST_URL`.
