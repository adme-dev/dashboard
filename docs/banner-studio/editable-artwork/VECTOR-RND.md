# Quiver / SVG Genie research and build-versus-buy

Checked: 26 October 2026. “QoVR” is interpreted as Quiver AI from the earlier link. This is a public-documentation assessment, not a paid benchmark or inspection of proprietary internals.

## What is established

- Quiver publishes image-to-SVG and text-to-SVG APIs, model discovery, SDK/MCP integration and Arrow model variants. Its public product describes foundational vector-generation models. Public documentation reviewed here does not reveal enough architecture, weights or training data to reproduce those models. [Product](https://quiver.ai/), [image-to-SVG API](https://docs.quiver.ai/developers/models/image-to-svg).
- SVG Genie exposes generation, vectorisation, account and history tools through an authenticated MCP. The reviewed MCP page documents the interface, not proof of the underlying model architecture. [MCP reference](https://www.svggenie.com/mcp-server).
- Canva describes Magic Layers as a capability of its own Design Model, reconstructing live text and separate objects. This does not establish it uses Nano Banana or GLM internally. [Canva](https://www.canva.com/newsroom/news/magic-layers/).
- Qwen Image Layered publicly supplies an Apache-2.0 model for RGBA decomposition. Its reference pipeline exposes layer count and a resolution setting, with 640 recommended and 1024 also mentioned. Output is layered raster, so print resolution and native typography still require separate work. The licence statement applies to this specific model, not all Qwen variants. [Official model card](https://huggingface.co/Qwen/Qwen-Image-Layered).

## Can we reverse-engineer it?

We can independently reproduce useful observable capabilities: accept a reference/prompt, produce structured vectors, select/recolour elements, revise text, render and compare. That is a feasible application pipeline around available models, geometric reconstruction and an SVG compiler.
We cannot infer that this reproduces Quiver's proprietary model or guarantees equivalent quality. Treat “reverse engineering” here as public-interface analysis and independent implementation using our own authorised fixtures. No private endpoint extraction, model-weight acquisition or vendor-output training programme is part of this brief. Actual contractual questions about a vendor benchmark are a separate procurement matter.

## Recommended pipeline to build

1. VLM/OCR proposes semantic structure and a constrained scene representation.
2. Deterministic geometry and font rendering reconstruct text, panels, rules and maps.
3. Segmentation plus background repair separates photographs.
4. Optional vector model converts selected complex graphics; deterministic tracing can be benchmarked for simple flat artwork.
5. SVG parser normalises safe geometry; editor adapter imports supported nodes or clearly labels a grouped SVG asset.
6. Render/compare/repair loop measures fidelity and editability; capped iteration count.
This architecture is our engineering proposal, not a claim about any vendor's internal implementation.

## Decision matrix

| Approach | Strength | Limitation | Recommended role |
|---|---|---|---|
| Native shapes/text + original assets | Exact copy and geometry; preserves OEM assets | Requires layout inference and font matching | Default reconstruction path |
| Qwen layered, managed inference | Separate raster objects; available weights | Raster output, resolution and regeneration risks | Candidate extraction provider |
| Quiver API | Dedicated SVG generation/vectorisation interface | External cost, latency, fidelity and native grouping need measurement | Optional complex vector adapter |
| SVG Genie MCP | Agent-friendly generation/vectorisation surface | Underlying pipeline unspecified on reviewed page | Secondary benchmark/integration candidate |
| General image editor | Background cleanup and image variations | Does not by itself provide native text/layout objects | Scoped raster operation |
| Train a new vector foundation model | Potential long-term control | Dataset, GPU and evaluation programme far outside MVP | Defer |

## Bounded experiment

Use authorised simple panels, map/icons, angled display lettering and complex illustration crops. Exclude photographic full-page tracing from the main success target. Compare deterministic reconstruction, a structured-output model and available vendor APIs on the SAME inputs.
Record actual model ID, provider request ID, prompt/version, input hash, timing, retries, actual billable usage, SVG byte/path count, sanitization results, render fidelity, selectable groups, live-text preservation and manual cleanup minutes. Vendor sandbox/deterministic test responses prove integration only, never model quality.
Do not invent price or latency estimates. Before billable runs, obtain account capability/price evidence and use the configured experiment budget. Until credentials/budget are available, prepare the harness and record “not benchmarked”.
Recommendation: build the workflow and data model ourselves, buy inference initially where it passes evaluation, and retain replacement adapters. MCP is an integration protocol, not the algorithm that creates vectors.

## Stage 0 continuation evidence

See [provider readiness](PROVIDER-READINESS.md) for refreshed official Arrow 2 / Telos interface details, the Qwen public config HTTP 200, and Quiver unauthenticated model-discovery HTTP 401. None is a paid quality benchmark. The Stage 1 map uses supplied road coordinates compiled to native rectangles and text; no vendor SVG output or photographic poster tracing is required for this fixture.
