# SW:Unlimited Proxy Sheet Tool

A single‑page web app to generate printable **Star Wars: Unlimited** proxy sheets (2×4 @ 300 DPI), sized for **11″×8.5″ landscape** and exportable for **Silhouette Cameo** workflows. Includes a **Netlify Function** proxy so SWU‑DB API calls (and images) work CORS‑free.

> Personal proxy use only. Not affiliated with FFG/Lucasfilm.

## Demo (self-hosted)
Deploy to Netlify using the Git integration (recommended). Functions are included at `netlify/functions/swu.js`.

## Quick Start (Local)
- You can open `index.html` directly in a modern browser for basic testing.
- Functions **won’t** run locally unless you use Netlify CLI:

```bash
npm i -g netlify-cli
netlify dev
# open the printed local URL; the proxy function will be available at
# /.netlify/functions/swu?path=/catalog/card-names
```

## Deploy to Netlify (Git Workflow)
1. **Import this repo** into your GitHub (or fork it).
2. On Netlify: **Add new site → Import from Git** → pick this repo.
3. Confirm settings from `netlify.toml`:
   ```toml
   [build]
     publish = "."
     functions = "netlify/functions"

   [functions]
     node_bundler = "esbuild"
   ```
4. Deploy; then verify the function:
   ```
   https://<your-site>.netlify.app/.netlify/functions/swu?path=/catalog/card-names
   ```

## Use
- Paste deck list (supports quantities like `2 Name`, or `Name x2`).
- Search/autocomplete for card names (via SWU‑DB).
- Upload custom images.
- **Export PNG** (3300×2550), **Print** (Scale 100%, Margins None), **Export DXF** for cutlines.

### Default Layout
- **Card**: 2.5″×3.5″ (750×1050 px @ 300 DPI)
- **Page**: 11″×8.5″ (3300×2550 px @ 300 DPI, landscape)
- **Grid**: 4 columns × 2 rows
- **Margins**: 0.5″ left/right, 0.75″ top/bottom
- **Bleed**: 0.5 mm (behind image only; cutlines are at edge)
- **Calibration**: 1″ square at bottom‑left

## Legal
Star Wars™ © & ™ Lucasfilm. Star Wars: Unlimited © Fantasy Flight Games. This project is for personal proxy printing and educational use only.
