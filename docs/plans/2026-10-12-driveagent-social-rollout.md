# DriveAgent News social rollout

User-approved scope: repair the existing Facebook publishing/feed/calendar integration and complete metrics and website conversion tracking, releasing necessary updates.

## Constraints

- XeroFlow remains the publisher for client `bc8a15a8-f523-4a75-a8f4-a501649bb71d`, Page `1391237540730945`.
- Preserve unrelated work. Release only reviewed source based on freshly fetched main.
- Inspect and hold stale unattempted posts before restoring dispatch. Do not blast a backlog or duplicate successful posts.
- Keep editorial approval for newly generated drafts. Investigate existing automatic rules before changing them.
- Marketing tracking requires an explicit visitor choice; never fabricate consent or turn existing analytics consent into marketing permission.
- Do not expose tokens or put credentials in logs. Do not invent a Meta dataset or use another client's destination.
- Provider-dependent activation may require the owner's Meta sign-in/permission grant; complete independent work first.

## Task 1 — Publishing diagnosis and repair (root)

Trace live dispatch, existing news-autopost rules and source, hold obsolete scheduled posts with an audit trail, restore authenticated scheduler delivery and source refresh. Reuse existing mechanisms where possible. Verify client-specific drafts and calendar, successful historical posts preserved.

## Task 2 — Facebook metrics (implementer)

Verify Graph v25 responses using live read-only evidence supplied by root. Fix provider failures being silently stored as zeroes, use supported metrics, preserve actual missing values, and add regression tests. Prepare cron release configuration; root controls live deployment and secret provisioning. Do not change publishing or tracking files.

## Task 3 — Website measurement (root/implementer)

Inspect existing DriveAgent tracking site and measurement profile. Reuse first-party analytics; implement independently consented Meta browser/server events only with a verified matching dataset and available provider access. Verify deduplication and conversion semantics. Record any activation blocker precisely.

## Task 4 — Review and release (root + reviewer)

Review all changes, run focused regression suites plus required deployment guards/builds. Update relevant public feature descriptions if functionality changes. Merge current branches, deploy using repository guards, and record exact commits/deployment IDs. Verify live calendar, metrics, tracking and established QR navigation. Retire owned completed worktrees only after integration.
