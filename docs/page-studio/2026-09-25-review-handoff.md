# Saved draft review handoff

Agency editors can choose **Save for review** when naming the current saved draft. Ordinary **Save version** remains a draft, and the client portal retains its existing behavior. Submission does not approve or publish the website.

The existing history mutation accepts an optional boolean `submitForReview` on `action: name`. Omitted and false are normalized consistently, including historic audit receipts. True is agency-only. The current checkpoint comparison, site lock, native login and edit authority remain in force; registration and submission share one transaction and its final authority recheck. The submission audit uses a distinct key. Retrying an acknowledged or uncertain request returns its original receipt; changing its intent under the same request ID conflicts.

Local acceptance: 67 tests cover components, authenticated HTTP, real PostgreSQL rollback/replay/staleness, and native-session authority. Both injected submission failure and expiry after submission roll back the new version and audits. Source review found no material issues. Focused ESLint passes. Native full-build verification uses an isolated checkout because the nested worktree inherits the parent dashboard's generated TypeScript path.

This increment is local until the native release is integrated. Client production activation still requires the approved saved version, verified artifact/compiler registrations, configured destination hostname and live form-delivery acceptance.
