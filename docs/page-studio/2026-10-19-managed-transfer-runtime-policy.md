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

The source preparation owner separately needs `managed-draft-transfer` with
the staging predecessor `6cb34fd939e71028567270190fb6d02c59011b2cdc1c4b0497effb3f702367f5`.
Do not put that policy in the management Worker merely because a finalization
adapter forwards its name: retained finalization does not prepare source execution.
The source preparation operator transport remains a separate rollout dependency.

The deployment validator continues to reject staging use, a different account or
namespace, unknown fields and an unchanged runtime. Pi admission and customer
editing/publication grants are unchanged. No public feature claim is added for
this private deployment setting.
