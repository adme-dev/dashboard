# Banner Dissector — Cloudflare Workers Pipeline Spec

## Overview

An automated pipeline that accepts a dealer banner image, analyses it using Workers AI vision models, segments it via Hugging Face SAM2, and outputs structured PNG assets + a layer manifest to R2. Designed to feed into Banner Studio as a pre-built asset package.

---

## Objectives

1. Accept a banner image upload (JPG/PNG)
2. Analyse the image and classify layers (graphic heading, logo, vehicle, background, editable text zones)
3. Generate segmentation masks for each layer
4. Extract and export each layer as a PNG to R2
5. Return a structured JSON manifest describing each layer's position, type, and asset path

---

## Architecture

```
banner-dissector/
├── workers/
│   ├── ingest/
│   │   ├── src/index.ts
│   │   └── wrangler.toml
│   ├── analyze/
│   │   ├── src/index.ts
│   │   ├── src/manifest.ts
│   │   └── wrangler.toml
│   └── segment/
│       ├── src/index.ts
│       ├── src/extract.ts
│       └── wrangler.toml
├── shared/
│   └── types.ts
└── package.json
```

---

## Workers

### 1. Ingest Worker

**Responsibility:** Accept image upload, store to R2, trigger analysis chain.

**Endpoint:** `POST /upload`

**Logic:**
```typescript
// Accept multipart form with image file
// Generate unique job ID (crypto.randomUUID())
// Store raw image to R2 at: banners/{jobId}/original.{ext}
// Call analyze worker via service binding
// Return jobId to client
```

**Bindings needed:**
- `BANNER_BUCKET` → R2 bucket
- `ANALYZE_WORKER` → service binding

---

### 2. Analyze Worker

**Responsibility:** Run Workers AI vision model, extract layer manifest.

**Model:** `@cf/llava-hf/llava-1.5-7b-hf`

**Prompt:**
```
Analyse this automotive dealer banner image and return a JSON object with the following structure. 
Identify each visual layer:

{
  "layers": [
    {
      "id": "headline",
      "type": "graphic_text",  // graphic_text | live_text | vehicle | logo | background
      "description": "HOT HYBRID OFFERS text with rectangular border graphic",
      "editable": false,
      "approximate_region": { "x": 0.1, "y": 0.05, "width": 0.8, "height": 0.45 },
      "font_notes": "condensed bold display font, white, custom brand typeface",
      "export_as_png": true
    }
  ],
  "editable_fields": [
    {
      "id": "price",
      "type": "price",
      "current_value": "$29,990",
      "approximate_region": { "x": 0.55, "y": 0.85, "width": 0.4, "height": 0.1 }
    },
    {
      "id": "model",
      "type": "model_name", 
      "current_value": "Stonic S Hybrid",
      "approximate_region": { "x": 0.55, "y": 0.80, "width": 0.4, "height": 0.05 }
    }
  ],
  "brand": "Kia",
  "campaign_type": "offer",
  "background_type": "gradient_sky"
}

Return only valid JSON, no markdown.
```

**Logic:**
```typescript
// Fetch image from R2
// Convert to base64
// Call Workers AI with image + prompt
// Parse returned JSON
// Store manifest to R2 at: banners/{jobId}/manifest.json
// Call segment worker via service binding with manifest
```

**Bindings needed:**
- `BANNER_BUCKET` → R2 bucket
- `AI` → Workers AI binding
- `SEGMENT_WORKER` → service binding

---

### 3. Segment Worker

**Responsibility:** Call Hugging Face SAM2 for masks, extract PNGs, write to R2.

**External API:** Hugging Face Inference API — `facebook/sam2-hiera-large`

**HF Endpoint:**
```
POST https://api-inference.huggingface.co/models/facebook/sam2-hiera-large
Authorization: Bearer {HF_API_TOKEN}
```

**Logic:**
```typescript
// For each layer in manifest where export_as_png === true:
//   1. Send image + approximate_region bounding box to HF SAM2
//   2. Receive mask PNG back
//   3. Apply mask to original image using WASM image processing (photon-rs or @cf/img via fetch)
//   4. Store cropped PNG to R2 at: banners/{jobId}/layers/{layer.id}.png
//   5. Update manifest with asset_path for each layer

// Write final manifest to R2 at: banners/{jobId}/manifest-final.json
// Return completed manifest to caller
```

**PNG Extraction approach:**
```typescript
// Option A — Cloudflare Image Resizing (if enterprise):
//   Use cf.image transform with mask

// Option B — WASM (recommended for Workers free/paid):
//   Import photon-rs compiled to WASM
//   Load original image bytes + mask bytes
//   Apply mask as alpha channel
//   Export as PNG buffer
//   Put to R2
```

**Bindings needed:**
- `BANNER_BUCKET` → R2 bucket
- `HF_API_TOKEN` → secret

---

## R2 Output Structure

```
banners/
└── {jobId}/
    ├── original.jpg
    ├── manifest.json           # Initial analysis manifest
    ├── manifest-final.json     # Final manifest with asset paths
    └── layers/
        ├── headline.png        # HOT HYBRID OFFERS graphic (PNG with transparency)
        ├── logo.png            # Brand logo lockup
        ├── vehicle.png         # Car cutout
        └── background.png      # Background plate
```

---

## Final Manifest Shape (manifest-final.json)

```json
{
  "jobId": "abc-123",
  "brand": "Kia",
  "campaign_type": "offer",
  "processed_at": "2026-03-02T00:00:00Z",
  "layers": [
    {
      "id": "headline",
      "type": "graphic_text",
      "description": "HOT HYBRID OFFERS with rectangular border",
      "editable": false,
      "export_as_png": true,
      "asset_path": "banners/abc-123/layers/headline.png",
      "r2_url": "https://pub-xxx.r2.dev/banners/abc-123/layers/headline.png"
    },
    {
      "id": "vehicle",
      "type": "vehicle",
      "description": "Kia Stonic white SUV",
      "editable": false,
      "export_as_png": true,
      "asset_path": "banners/abc-123/layers/vehicle.png",
      "r2_url": "https://pub-xxx.r2.dev/banners/abc-123/layers/vehicle.png"
    },
    {
      "id": "background",
      "type": "background",
      "description": "Salt flat with gradient sky",
      "editable": false,
      "export_as_png": true,
      "asset_path": "banners/abc-123/layers/background.png",
      "r2_url": "https://pub-xxx.r2.dev/banners/abc-123/layers/background.png"
    },
    {
      "id": "logo",
      "type": "logo",
      "description": "Kia logo + Movement that inspires",
      "editable": false,
      "export_as_png": true,
      "asset_path": "banners/abc-123/layers/logo.png",
      "r2_url": "https://pub-xxx.r2.dev/banners/abc-123/layers/logo.png"
    }
  ],
  "editable_fields": [
    {
      "id": "price",
      "type": "price",
      "current_value": "$29,990",
      "approximate_region": { "x": 0.55, "y": 0.85, "width": 0.4, "height": 0.1 }
    },
    {
      "id": "model",
      "type": "model_name",
      "current_value": "Stonic S Hybrid drive away from",
      "approximate_region": { "x": 0.55, "y": 0.80, "width": 0.4, "height": 0.05 }
    }
  ]
}
```

---

## wrangler.toml — Ingest Worker

```toml
name = "banner-ingest"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "BANNER_BUCKET"
bucket_name = "banner-assets"

[[services]]
binding = "ANALYZE_WORKER"
service = "banner-analyze"
```

---

## wrangler.toml — Analyze Worker

```toml
name = "banner-analyze"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "BANNER_BUCKET"
bucket_name = "banner-assets"

[ai]
binding = "AI"

[[services]]
binding = "SEGMENT_WORKER"
service = "banner-segment"
```

---

## wrangler.toml — Segment Worker

```toml
name = "banner-segment"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "BANNER_BUCKET"
bucket_name = "banner-assets"

[vars]
HF_MODEL = "facebook/sam2-hiera-large"

# Add secret via CLI:
# wrangler secret put HF_API_TOKEN
```

---

## Secrets to Configure

```bash
# Run these in your project before deploying
wrangler secret put HF_API_TOKEN --name banner-segment
```

---

## Claude Code Prompts — Build Order

Run these sequentially in Claude Code CLI:

```bash
# 1. Scaffold the three workers
claude "Create three Cloudflare Workers in a monorepo: banner-ingest, banner-analyze, banner-segment. Each with its own wrangler.toml as per the spec. Use TypeScript. Add a shared/types.ts with the LayerManifest and EditableField interfaces."

# 2. Build ingest worker
claude "Build the ingest worker. POST /upload accepts multipart form image, stores to R2 under banners/{jobId}/original.jpg, calls analyze worker via service binding, returns { jobId } JSON."

# 3. Build analyze worker  
claude "Build the analyze worker. Fetch image from R2, convert to base64, call @cf/llava-hf/llava-1.5-7b-hf with the layer analysis prompt, parse the JSON response, store manifest.json to R2, call segment worker."

# 4. Build segment worker
claude "Build the segment worker. Loop through manifest layers where export_as_png is true, call HF SAM2 API with image + bounding box, apply mask using photon-rs WASM to extract PNG, store each layer PNG to R2, write manifest-final.json."

# 5. Wire up and test
claude "Add a GET /status/{jobId} endpoint to the ingest worker that reads manifest-final.json from R2 and returns it. Then create a test script that uploads the Kia banner image and polls for the completed manifest."
```

---

## Notes

- Region coordinates in the manifest use normalised values (0–1) relative to image width/height for resolution independence
- SAM2 accepts point prompts or bounding box prompts — use bounding box from the vision model output for best results
- If HF SAM2 inference is slow, consider queuing jobs via a Durable Object and polling `/status/{jobId}` rather than awaiting inline
- Background layer can be extracted by inverting all other masks combined
- This manifest feeds directly into Banner Studio as the asset slot definition per campaign

---

*Generated for ADME Banner Studio R&D — March 2026*
