# FigFlow EDM project — start here

Status: F01 discovery and F02/F03/F05 implementation are in progress. Shared
contracts, revision persistence and renderer adaptation have local tests;
the FigFlow bridge and product routes are not activated or deployed.

- [Source inventory and discovery evidence](figflow-integration-inventory.md)
- [Product requirements and design](../superpowers/specs/2026-10-30-figflow-edm-design.md)
- [Execution plan, task ledger and review record](../superpowers/plans/2026-10-30-figflow-edm.md)

The task ledger is the canonical progress record. Claim F01 first; do not treat the design as evidence that the hosted bridge exists. F02 defines the shared module contract and decides which composer controls need improvements. Other tasks follow the recorded dependencies.

For every handoff, update owner/status, source branch and commit, test evidence, blockers and next action in the ledger. Keep implementation, deployment and actual email-client acceptance separate. Preserve the current workspace's unrelated email-builder changes.
