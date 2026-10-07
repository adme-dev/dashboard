Private customer CMS prerequisites (RND-22)

Implement the existing collection, workflow and collection-staging upgrades under a dedicated customer editor-session adapter. No public/browser route, customer SQL, schema authoring, allocation, billing or publication grant.

- Keep strict existing upgrade contracts and private coordinator methods; only upgrade actor schemas gain customer-user (attachment/preparation grants unchanged).
- A strict status/start/recover contract selects an allowlisted kind. Scope, resource discovery and actor come from native customer workspace:create authority and trusted bindings.
- Start retains original operation, request, identity and exact native child claims in append-only audit under native account/identity/session -> workspace/site -> child lock order. Recheck after discovery and on immutable retry. Provider calls occur outside SQL.
- Worker callbacks validate exact retained upgrade, audit identity/actor and current original/recovered child authority. Customer staging only. Existing legacy callback path unchanged and generic native preparation denies customer input.
- Recovery explicitly CASes the latest recovery receipt under site lock, permits only the same original verified owner, retains original operation/actor/resources, and switches only effective native child claims. Exact replay cannot rewind later recovery. Status is read-only; foreign or stale claims cannot dispatch.
- Bounded status projections contain no database identifiers or login digests. Exact installed receipt verified before success.
- Add private customer control-client and gateway operation. PostgreSQL tests cover all3 kinds, immutable/concurrent retries, explicit recovery, callback revocation, remote-work races, mismatched targets/receipts, rollback and cross-scope denial. Paired protocol/runtime tests prove customer actor persistence without attachment grants.
- Full required local gates, independent review, paired stacked draft PRs, canonical PRD receipts. Keep rollout disabled; browser/Sandbox and hosted isolation remain next.
