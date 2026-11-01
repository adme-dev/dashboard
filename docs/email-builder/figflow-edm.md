# FigFlow EDM project — start here

Status: the disabled foundation is merged and deployed (PR #801, source
`a193e82a5`). Existing template writes remain on Pages. F01/F02/F03/F05 are
partial; the FigFlow bridge, staff round trip and shared-module publishing
remain unfinished and are not activated.

- [Active first round-trip milestone](figflow-roundtrip-milestone.md)
- [Current deployment, blockers and developer handoff](figflow-developer-handoff.md)
- [Source inventory and discovery evidence](figflow-integration-inventory.md)
- [Product requirements and design](../superpowers/specs/2026-10-30-figflow-edm-design.md)
- [Execution plan, task ledger and review record](../superpowers/plans/2026-10-30-figflow-edm.md)

The task ledger is the canonical progress record. Claim the next bounded package in the handoff; do not treat the design as evidence that the hosted bridge exists. F02 defines the shared module contract and decides which composer controls need improvements. Other tasks follow the recorded dependencies.

For every handoff, update owner/status, source branch and commit, test evidence, blockers and next action in the ledger. Keep implementation, deployment and actual email-client acceptance separate. Preserve the current workspace's unrelated email-builder changes.
