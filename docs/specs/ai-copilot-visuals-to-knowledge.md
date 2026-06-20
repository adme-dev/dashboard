# Spec: Visuals → Knowledge (Phase 4 addendum)

**Status:** Design — V-1 implementation-ready
**Parent:** [Observe & Learn](./ai-copilot-observe-and-learn.md), [Memory architecture](./ai-copilot-memory-architecture.md)
**Created:** 2026-06-20

---

## 1. Problem

The KB + memory are **text-only** (bge-base 768-dim text vectors in Vectorize). Visual assets — creative
proofs, banners, generated images, video — are invisible to the assistant. It can't answer "find the banner
we made for Acme's spring campaign" or "what proofs are pending visual sign-off".

## 2. The choice — and why we don't have to make it

Two ways to represent visuals:

- **A. Caption-to-text** — a vision model *describes/tags* the asset → that text enters the existing text KB
  with a link back to the asset. Cheap, **Cloudflare-native** (Workers AI vision), no new index, immediately
  searchable by words and reasoned over by the assistant.
- **B. Multimodal embedding** — embed the pixels into a vector space for true **visual similarity** ("looks
  like this", creative dedupe). Needs a SEPARATE vector index + image-embedding model.

R&D (2026): Google's **Gemini Embedding 2** (GA Mar 2026, first natively multimodal embedding — text/image/
video in one space) removes the old text-vs-image index split *if/when* we go multimodal ([Google Developers
Blog](https://developers.googleblog.com/building-with-gemini-embedding-2/)). But it's a Google/Vertex model
(external) needing its own Vectorize index sized to its dims; our KB is bge-base text.

**Decision:** **A now, B later.** Caption-to-text gives the assistant visual *awareness* natively and cheaply;
a multimodal index (Gemini Embedding 2 the leading option, or a Workers-AI CLIP-style embedder to stay native)
is an additive **phase-2** added only when visual-similarity search is actually needed. We do NOT have to pick
between text and visual knowledge — caption-to-text makes visuals text-knowledge today.

## 3. V-1 — caption-to-text (this slice)

```
asset (proof/banner/image/video frame) ──► vision model (Workers AI, injected)
  ──► caption + tags (PURE prompt + tolerant parser)
  ──► VisualKnowledge candidate { caption, tags, assetUrl, scope }
  ──► KB DRAFT (propose→review→publish) or scoped memory — NEVER auto-published
```

- **Native:** default caption dep is a Workers AI vision model (id verified at wiring time); injected so the
  core is unit-tested without a model.
- **Scoped + gated:** a caption is a *candidate*, not auto-knowledge. It flows through the existing
  `propose_knowledge_article` review/publish gate (org KB) or the DS-2 department-memory gate — same
  "shared scope is curated, never auto-written" rule. Personal scope by default.
- **Asset link preserved** so the assistant cites/links the actual visual.

## 4. Phase 2 (deferred — documented, not built)

- Multimodal embedding index (Gemini Embedding 2 *or* native CLIP) for visual-similarity retrieval — separate
  Vectorize index/namespace, additive. Decide native-vs-Google at that point.

## 5. Acceptance (V-1)

- A visual asset yields a caption+tags candidate that lands as a KB draft / scoped memory, never auto-published.
- Vision model injected; pure prompt+parser unit-tested; fail-safe (a caption failure never breaks anything).
- Zero new type errors.
