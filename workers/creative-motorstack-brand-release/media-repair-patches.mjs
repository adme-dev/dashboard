// Exact, reversible changes to the verified MotorStack adapter.
export const mediaRepairPatches = [
  [
    "      if (model) {\n        try {\n          const variants = await rpc(key, \"get_variants\", { oem: brand, model, include_photos: false });",
    "      {\n        try {\n          const variants = await rpc(key, \"get_variants\", { oem: brand, ...model ? { model } : {}, include_photos: Boolean(model) });"
  ],
  [
    "      if (!Object.values(MIME).includes(mime) || mime !== asset.mime) throw new AdapterError(502, \"asset_type_refused\");\n      const bytes = await boundedBody(res, FILE_LIMIT);",
    "      const raster = new Set([\"image/png\", \"image/jpeg\", \"image/webp\", \"image/gif\"]);\n      const rasterConversion = raster.has(asset.mime) && raster.has(mime);\n      if (!Object.values(MIME).includes(mime) || (mime !== asset.mime && !rasterConversion)) throw new AdapterError(502, \"asset_type_refused\");\n      const bytes = await boundedBody(res, FILE_LIMIT);\n      // CDN paths may retain .png while the delivered file is WebP. Verify the\n      // actual format before accepting that conversion; never relax documents,\n      // vectors or fonts, and never use the filename as the response MIME.\n      if (mime !== asset.mime) {\n        const b = new Uint8Array(bytes);\n        const ascii = (start, end) => String.fromCharCode(...b.slice(start, end));\n        const valid = mime === \"image/webp\" ? b.length >= 12 && ascii(0, 4) === \"RIFF\" && ascii(8, 12) === \"WEBP\"\n          : mime === \"image/png\" ? b.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => b[i] === v)\n            : mime === \"image/jpeg\" ? b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255\n              : b.length >= 6 && [\"GIF87a\", \"GIF89a\"].includes(ascii(0, 6));\n        if (!valid) throw new AdapterError(502, \"asset_type_refused\");\n      }"
  ]
]
