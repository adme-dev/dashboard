# Architecture decision record — hybrid reconstruction

Status: proposed; initial direction selected for the pilot, subject to evaluation.
Date: 26 October 2026.

## Context

Flat artwork mixes photographic content, live-copy candidates and geometry. The existing editor already supports native text and effects. Converting everything into either PNG layers or SVG paths discards important editing semantics.

## Decision

Reconstruct a hybrid native document. Own the document schema, editor integration, scope validation, job lifecycle and evaluation. Reuse original assets and exact supplied copy. Buy replaceable inference initially where available; evaluate selected-asset vectorisation independently from raster decomposition.

## Alternatives

- Whole-page SVG tracing: unsuitable as the default for photographs and does not ensure live text.
- Transparent PNG layers alone: supports repositioning but not normal text editing.
- Vendor-only editor: quicker externally, but does not establish native Banner Studio editing and platform policy integration.
- Train a competing vector foundation model: outside the first release and not justified without benchmark evidence.

## Consequences

Requires background repair, typography reconstruction, provenance and an honest partial-result workflow. Provider independence adds adapters but avoids binding the document format to one model. Exact appearance may need reviewed font substitution; no promise of lossless recovery. Keep legacy projects compatible and preserve original artifacts.

## Revisit when

Pilot evidence establishes correction effort, model costs, SVG editability and print fidelity. Any model/provider switch must rerun the applicable evaluation rather than inheriting previous quality claims.
