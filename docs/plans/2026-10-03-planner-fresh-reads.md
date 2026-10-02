# Planner reads immediately after saving

Observed live: the DriveAgent product campaign was created successfully but its
list still showed no campaigns. After linking the News video draft, the unfiltered
board showed “No campaign”; a newly filtered query showed the correct association.
Both records were confirmed in the production database. The ordinary Hyperdrive
configuration caches queries; the existing fresh configuration disables caching.
Cloudflare documents that writes do not invalidate matching cached reads:
https://developers.cloudflare.com/hyperdrive/concepts/query-caching/

1. Reproduce stale campaign/board/badge outcomes in the existing handler tests.
   Acceptance: tests fail against cached reads and retain client access checks.
2. Route campaign list, board and publishing badges through existing fresh helpers.
   Acceptance: new tests and relevant publishing regressions pass; no global cache,
   configuration, feature flags, permission, mutation or publishing changes.
3. Review and release the current stacked source with the guarded Pages scripts.
   Acceptance: current main ancestry, size guards and production deployment pass;
   both saved campaigns and the linked News draft are visible after reload; existing
   video preview and QR detail/list navigation continue working.

The existing deployed rollout is preserved from commit 175274d9d. This fix starts
from fetched origin/main and fast-forwards that still-unmerged rollout into its
release candidate; it does not retire PRs 617–619 while their work remains unmerged.
