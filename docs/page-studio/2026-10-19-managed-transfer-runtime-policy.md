# Managed transfer runtime policy

The production management Worker now declares the destination execution policy
needed by the prepared transfer implementation. This is release configuration,
not a record of deployment, a completed transfer or customer activation.

The policy is limited to account `a5b299b3ad15c1b5b895dc66f9357b17`, production
dispatch namespace `xeroflow-page-studio-dispatch-production` and kind
`managed-draft-import`. It transitions the production bootstrap runtime
`2dd87c86b6d909889e4fa2dc60dbca45b660144d5169d054e8a1fcd8b737ce83`
(compatibility date `2026-09-07`) to
`40aa0efe85f87918c569b8388a3403af51ee8c33d741c56eeb956a702ab7105d`
(compatibility date `2026-08-18`). Dates belong to their respective artifacts;
they are not inferred from deployment time.

The successor is the 1,101,341-byte tenant runtime built from Studio
`b08d3a9e820c768e257f4a46237d044d8f2a13e4`. Its digest was checked against
the prepared private executor policy. The predecessor's production R2 bytes
were independently read back and hashed. No existing tenant is globally repinned.

## Release order

1. Pass exact-source CI in both repositories and reconcile current main.
2. Complete compatible Studio service deployment and runtime review. Upload the
   exact successor to its private digest key and independently hash its readback.
   The runtime build manifest's `releaseApproved: false` is not release approval.
3. Verify production registry migrations and preserve existing native/D1/R2
   state. Compare live management configuration immediately before deployment.
4. Deploy management using its guarded production command from clean, exact
   Dashboard main. The private executor must use the identical destination
   policy. Deploy Dashboard Pages through its existing guarded command.
5. Perform explicit transfer acceptance with the original owner/operator
   authority; verify retained published releases and unchanged domain routing.

The private `managedTransferPreparation` service-binding RPC now owns the early
native phases. It declares `managed-draft-transfer` with staging predecessor
`6cb34fd939e71028567270190fb6d02c59011b2cdc1c4b0497effb3f702367f5` and the
same successor as the destination policy. Resource preparation uses the existing
production bootstrap runtime and schema
`012054889e832d8753033811f9a6306d0b9f90a552c9f0a0af9ec5a6f62d435a`.
The deployment validator checks the shared successor and bootstrap consistency.

The RPC accepts `expectedEnvironment: "production"` and an explicit phase:
`review`, `reserve`, `resources`, `source-execution`, `source-drafts`,
`destination-execution`, `destination-catalogue`, or `forms-history`.
Review requires the original native owner/operator authority. Reservation also
requires an operation UUID and reviewed source digest. Later phases accept only
that operation UUID, immutable intent digest and `status`, `start`, `resume` or
`verify` action (`source-drafts` has no verify action). Every native coordinator
revalidates original authority, retained requests and source state.

Responses expose only bounded progress, source-review metadata or immutable
reservation identity. Failures retain safe status codes without provider/SQL
payloads. There is no HTTP route, automatic phase chaining or uncertain-write
retry. The entry point is not a customer launch screen: the authenticated operator
consent handoff and hosted end-to-end acceptance remain rollout dependencies.

The deployment validator continues to reject staging use, a different account or
namespace, unknown fields and an unchanged runtime. Pi admission and customer
editing/publication grants are unchanged. No public feature claim is added for
this private deployment setting.
