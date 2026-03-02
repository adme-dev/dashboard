# Banner Dissector — Cloudflare Workers Pipeline Spec v2
*Updated with MCP Server Layer + Variable Token Pattern*

---

## Overview

An automated pipeline that accepts a dealer banner image, analyses it using Workers AI vision models, segments it via Hugging Face SAM2, and outputs structured PNG assets + a layer manifest to R2. The manifest follows a variable token pattern (inspired by Pencil's .pen format) so Banner Studio can reconstruct and vary banners programmatically. A local MCP server exposes Banner Studio to Claude Code, enabling AI-driven banner generation without a UI during R&D.

---

## Key Architectural Additions (v2)

1. **Variable Token System** — manifest uses design tokens for all editable values, not raw strings
2. **Two-Way Manifest** — manifest is both readable output AND writeable source of truth
3. **MCP Server** — Banner Studio exposes tools via MCP so Claude Code can generate, modify, and export banner variants directly from the CLI

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
├── mcp-server/                   # NEW — MCP server for Claude Code integration
│   ├── src/
│   │   ├── index.ts              # MCP server entry
│   │   ├── tools/
│   │   │   ├── analyze-banner.ts
│   │   │   ├── generate-variant.ts
│   │   │   ├── update-tokens.ts
│   │   │   └── export-banner.ts
│   │   └── r2-client.ts
│   └── package.json
├── shared/
│   └── types.ts
└── package.json
```

---

## Variable Token System

All editable values in the manifest are expressed as typed design tokens — not raw strings. This means a price change propagates consistently across all banner sizes, and tokens can be validated against brand rules before rendering.

### Token Types

```typescript
type TokenType =
  | 'price'           // "$29,990" — currency formatted
  | 'price_label'     // "drive away from" — offer descriptor
  | 'model_name'      // "Stonic S Hybrid"
  | 'brand'           // "Kia"
  | 'campaign_label'  // "Hot Hybrid Offers"
  | 'color'           // "#FFFFFF" — brand colour token
  | 'font_size'       // "72px" — typography scale token
  | 'disclaimer'      // "*Conditions apply..."
  | 'cta_label'       // "Learn More"
  | 'image_asset'     // R2 path to swappable image
```

### Token Definition Shape

```typescript
interface DesignToken {
  id: string               // "token.price"
  type: TokenType
  value: string            // Current value
  label: string            // Human-readable label for Banner Studio UI
  editable: boolean        // Can be changed per campaign
  required: boolean        // Must be present for valid banner
  validation?: {
    maxLength?: number
    pattern?: string       // Regex e.g. /^\$[\d,]+\*?$/
    allowedValues?: string[] // For constrained tokens like brand colours
  }
  affects_layers: string[] // Layer IDs that re-render when this token changes
}
```

### Example Token Definitions for Kia Banner

```json
{
  "tokens": {
    "token.price": {
      "id": "token.price",
      "type": "price",
      "value": "$29,990",
      "label": "Drive Away Price",
      "editable": true,
      "required": true,
      "validation": {
        "pattern": "^\\$[\\d,]+\\*?$"
      },
      "affects_layers": ["price_text"]
    },
    "token.price_label": {
      "id": "token.price_label",
      "type": "price_label",
      "value": "drive away from",
      "label": "Price Descriptor",
      "editable": true,
      "required": false,
      "validation": {
        "maxLength": 30
      },
      "affects_layers": ["price_text"]
    },
    "token.model_name": {
      "id": "token.model_name",
      "type": "model_name",
      "value": "Stonic S Hybrid",
      "label": "Model Name",
      "editable": true,
      "required": true,
      "affects_layers": ["price_text", "meta"]
    },
    "token.campaign_label": {
      "id": "token.campaign_label",
      "type": "campaign_label",
      "value": "Hot Hybrid Offers",
      "label": "Campaign Headline",
      "editable": false,
      "required": true,
      "affects_layers": ["headline"]
    },
    "token.color.primary": {
      "id": "token.color.primary",
      "type": "color",
      "value": "#FFFFFF",
      "label": "Primary Colour",
      "editable": false,
      "required": true,
      "validation": {
        "allowedValues": ["#FFFFFF", "#05141F", "#EB0029"]
      },
      "affects_layers": ["headline", "price_text", "logo"]
    },
    "token.vehicle_image": {
      "id": "token.vehicle_image",
      "type": "image_asset",
      "value": "banners/abc-123/layers/vehicle.png",
      "label": "Vehicle Image",
      "editable": true,
      "required": true,
      "affects_layers": ["vehicle"]
    }
  }
}
```

---

## Full Manifest Shape (manifest-final.json)

The manifest is both the pipeline output AND the source of truth Banner Studio reads to reconstruct the banner. Editing the JSON updates the banner; editing the banner canvas updates the JSON.

```json
{
  "jobId": "abc-123",
  "version": "2.0",
  "brand": "Kia",
  "campaign_type": "offer",
  "banner_size": "1080x1080",
  "processed_at": "2026-03-02T00:00:00Z",

  "tokens": {
    "token.price": { ... },
    "token.model_name": { ... },
    "token.vehicle_image": { ... }
  },

  "layers": [
    {
      "id": "background",
      "type": "background",
      "description": "Salt flat gradient sky plate",
      "z_index": 0,
      "editable": false,
      "export_as_png": true,
      "asset_path": "banners/abc-123/layers/background.png",
      "r2_url": "https://pub-xxx.r2.dev/banners/abc-123/layers/background.png",
      "region": { "x": 0, "y": 0, "width": 1, "height": 1 }
    },
    {
      "id": "vehicle",
      "type": "vehicle",
      "description": "Kia Stonic white SUV cutout",
      "z_index": 1,
      "editable": false,
      "export_as_png": true,
      "asset_path": "banners/abc-123/layers/vehicle.png",
      "r2_url": "https://pub-xxx.r2.dev/banners/abc-123/layers/vehicle.png",
      "token_bindings": ["token.vehicle_image"],
      "region": { "x": 0.05, "y": 0.3, "width": 0.75, "height": 0.55 }
    },
    {
      "id": "headline",
      "type": "graphic_text",
      "description": "HOT HYBRID OFFERS with rectangular border — brand typeface, not live text",
      "z_index": 2,
      "editable": false,
      "export_as_png": true,
      "asset_path": "banners/abc-123/layers/headline.png",
      "r2_url": "https://pub-xxx.r2.dev/banners/abc-123/layers/headline.png",
      "token_bindings": ["token.campaign_label", "token.color.primary"],
      "region": { "x": 0.05, "y": 0.02, "width": 0.9, "height": 0.42 }
    },
    {
      "id": "price_text",
      "type": "live_text",
      "description": "Model name, price descriptor, and price — editable per campaign",
      "z_index": 3,
      "editable": true,
      "export_as_png": false,
      "render_as": "html",
      "token_bindings": ["token.model_name", "token.price_label", "token.price"],
      "region": { "x": 0.5, "y": 0.78, "width": 0.47, "height": 0.18 },
      "typography": {
        "model_name": { "font_weight": "600", "font_size": "18px", "color": "#FFFFFF" },
        "price_label": { "font_weight": "400", "font_size": "16px", "color": "#FFFFFF" },
        "price": { "font_weight": "700", "font_size": "52px", "color": "#FFFFFF" }
      }
    },
    {
      "id": "logo",
      "type": "logo",
      "description": "Kia logo + Movement that inspires lockup",
      "z_index": 4,
      "editable": false,
      "export_as_png": true,
      "asset_path": "banners/abc-123/layers/logo.png",
      "r2_url": "https://pub-xxx.r2.dev/banners/abc-123/layers/logo.png",
      "region": { "x": 0.02, "y": 0.85, "width": 0.28, "height": 0.12 }
    }
  ]
}
```

---

## MCP Server — Banner Studio

The MCP server runs locally alongside Claude Code and exposes Banner Studio as a set of tools. Claude Code can then generate, modify, and export banner variants from the CLI without touching a UI.

### Setup

```bash
cd mcp-server
npm install
npm run build

# Add to Claude Code config
claude mcp add banner-studio node /path/to/mcp-server/dist/index.js
```

### MCP Tools Exposed

#### `analyze_banner`
Uploads a banner image and runs the full pipeline — returns the completed manifest.

```typescript
{
  name: "analyze_banner",
  description: "Upload a dealer banner image and extract its layer manifest and design tokens",
  inputSchema: {
    image_path: string,      // Local path to banner image
    brand: string            // "Kia" | "Toyota" | "Volkswagen" etc
  }
}
```

#### `generate_variant`
Takes an existing manifest and a set of token overrides, renders a new banner, exports to R2.

```typescript
{
  name: "generate_variant",
  description: "Generate a banner variant by overriding specific design tokens",
  inputSchema: {
    job_id: string,           // Base manifest job ID
    token_overrides: {        // Only tokens being changed
      "token.price": "$32,990",
      "token.model_name": "Stonic GT-Line Hybrid"
    },
    output_size: string       // "1080x1080" | "1200x628" | "300x250"
  }
}
```

#### `update_tokens`
Updates token values in an existing manifest without re-rendering — for bulk campaign prep.

```typescript
{
  name: "update_tokens",
  description: "Update design token values in an existing banner manifest",
  inputSchema: {
    job_id: string,
    tokens: Record<string, string>
  }
}
```

#### `export_banner`
Renders and exports a manifest to a final flat PNG or HTML5 banner.

```typescript
{
  name: "export_banner",
  description: "Render and export a banner manifest to PNG or HTML5",
  inputSchema: {
    job_id: string,
    format: "png" | "html5",
    sizes: string[]           // ["1080x1080", "1200x628", "300x250"]
  }
}
```

### Example Claude Code Workflow

Once the MCP server is running, you can drive the entire banner pipeline from Claude Code:

```bash
claude "Analyse the Kia Stonic banner at ./assets/kia-stonic.jpg and give me the manifest"

claude "Generate 3 variants of job abc-123 — one at $27,990 for the Stonic S, 
        one at $32,990 for the Stonic GT-Line, one at $35,990 for the Stonic X-Line. 
        Export all three as PNG and 1080x1080"

claude "Update all Kia banners to use the new March campaign headline 
        and export as HTML5 in all standard IAB sizes"
```

---

## Workers

### 1. Ingest Worker

**Endpoint:** `POST /upload`

```typescript
// Accept multipart form with image file
// Generate unique job ID (crypto.randomUUID())
// Store raw image to R2 at: banners/{jobId}/original.{ext}
// Call analyze worker via service binding
// Return { jobId } to client
```

**Bindings:** `BANNER_BUCKET` (R2), `ANALYZE_WORKER` (service)

---

### 2. Analyze Worker

**Model:** `@cf/llava-hf/llava-1.5-7b-hf`

**Prompt:**
```
Analyse this automotive dealer banner image. Return a JSON object describing each visual layer.
Classify each layer as one of: graphic_text | live_text | vehicle | logo | background

For each layer include:
- id, type, description
- editable (true if value changes per campaign)
- export_as_png (true if it's a brand graphic, false if it's live text)
- approximate_region as normalised coordinates { x, y, width, height } (0-1 scale)
- font_notes if text layer

Also extract editable_fields: price, model_name, price_label, disclaimer.
Return only valid JSON. No markdown.
```

**Logic:**
```typescript
// Fetch image from R2 → base64
// Call Workers AI with image + prompt
// Parse JSON response → build token definitions
// Store manifest.json to R2
// Call segment worker via service binding
```

**Bindings:** `BANNER_BUCKET` (R2), `AI` (Workers AI), `SEGMENT_WORKER` (service)

---

### 3. Segment Worker

**External API:** Hugging Face — `facebook/sam2-hiera-large`

```typescript
// For each layer where export_as_png === true:
//   POST to HF SAM2 with image + bounding box from manifest region
//   Receive segmentation mask
//   Apply mask to original using photon-rs WASM
//   Store PNG to R2 at: banners/{jobId}/layers/{layer.id}.png
//   Update manifest with asset_path and r2_url

// Write manifest-final.json to R2
// Return completed manifest
```

**Bindings:** `BANNER_BUCKET` (R2), `HF_API_TOKEN` (secret)

---

## R2 Output Structure

```
banners/
└── {jobId}/
    ├── original.jpg
    ├── manifest.json              # Initial analysis
    ├── manifest-final.json        # Final with asset paths + full tokens
    └── layers/
        ├── background.png
        ├── vehicle.png            # Car cutout with transparency
        ├── headline.png           # Graphic text PNG (brand-locked)
        └── logo.png               # Logo lockup PNG
```

---

## Wrangler Configs

### Ingest Worker

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

### Analyze Worker

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

### Segment Worker

```toml
name = "banner-segment"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "BANNER_BUCKET"
bucket_name = "banner-assets"

[vars]
HF_MODEL = "facebook/sam2-hiera-large"

# wrangler secret put HF_API_TOKEN --name banner-segment
```

---

## Secrets

```bash
wrangler secret put HF_API_TOKEN --name banner-segment
```

---

## Claude Code Build Prompts — Run in Order

```bash
# 1. Scaffold monorepo
claude "Create a Cloudflare Workers monorepo with three workers (banner-ingest, 
        banner-analyze, banner-segment) and an mcp-server directory. Each worker 
        gets its own wrangler.toml. Add shared/types.ts with DesignToken, 
        LayerManifest, and BannerLayer interfaces matching the v2 spec."

# 2. Build ingest worker
claude "Build the ingest worker. POST /upload accepts multipart form image, 
        stores to R2 under banners/{jobId}/original.jpg, calls analyze worker 
        via service binding, returns { jobId }."

# 3. Build analyze worker
claude "Build the analyze worker. Fetch image from R2, convert to base64, 
        call @cf/llava-hf/llava-1.5-7b-hf with the layer analysis prompt, 
        parse JSON, build DesignToken definitions from editable_fields, 
        store manifest.json to R2, call segment worker."

# 4. Build segment worker
claude "Build the segment worker. Loop through manifest layers where 
        export_as_png is true, call HF SAM2 API with bounding box, 
        apply mask using photon-rs WASM, store PNGs to R2, 
        write manifest-final.json with asset_path and r2_url per layer."

# 5. Build MCP server
claude "Build an MCP server in mcp-server/ that exposes four tools: 
        analyze_banner, generate_variant, update_tokens, export_banner. 
        Tools communicate with the Cloudflare Workers via fetch. 
        Use the @anthropic-ai/mcp-server-sdk package."

# 6. Status endpoint + test
claude "Add GET /status/{jobId} to the ingest worker that reads 
        manifest-final.json from R2. Then write a test script that 
        uploads the Kia banner, polls for completion, and prints the manifest."
```

---

## Design Principles

**Manifest as source of truth** — editing the JSON updates the banner, editing the banner canvas updates the JSON. Same two-way pattern as Pencil's .pen files.

**Tokens over raw strings** — every editable value is a typed, validated token. Price changes propagate to all affected layers. Brand colours are constrained to an allowed values list.

**MCP as the interface** — during R&D, Claude Code is the UI. No frontend needed to generate 50 campaign variants.

**Graphic vs live text split** — brand-locked headings and logos are always PNGs. Price, model, and offer copy are always live text driven by tokens. This keeps brand compliance intact while making campaigns fast to turn around.

---

*Generated for ADME Banner Studio R&D — March 2026 — v2*
