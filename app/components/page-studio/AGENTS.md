# Page Studio dashboard component boundary

This directory belongs to the XeroFlow management and governance control plane.

- Do not implement a visual website builder, canvas, responsive frame surface, inspector, inline editor, component renderer, template composer, or AI page composer here.
- The canonical visual editor lives in the private `adme-dev/xeroflow-page-studio` repository and is opened through a signed editor session.
- Dashboard components may manage sites, governed page metadata, reviews, builds, releases, domains, subscriptions, settings, and audit state.
- Preserve the standalone Studio boundary described in `docs/architecture/page-studio-editor-source-of-truth.md`.
