# SW:Unlimited — Proxy Sheet Tool (v0.2.6a)

**What’s included**
- `index.html` (UI wired to the tool)
- `styles.css` (minimal dark theme)
- `script.js` v0.2.6a (overlay + pasted list fixes)
- `assets/letter_poker_v2_fixed.svg` (2x4 template for letter paper)
- Netlify function `netlify/functions/swu.js` that proxies to SWU-DB and CDN with CORS headers
- `netlify.toml` build + redirect config

**Deploy**
1. Push to your GitHub repo connected to Netlify.
2. The site should serve at `/.netlify/functions/swu` and `assets/letter_poker_v2_fixed.svg`.
3. If you prefer `/functions/swu`, the provided redirect maps it.

**Usage**
- Paste names (one per line, commas/semicolons OK). Supports `2x Name` style counts.
- Adjust layout: `4 cols × 2 rows`, `2.5 × 3.5 in`, bleed in mm, margins in inches.
- Toggle the overlay or upload your own PNG/SVG.
- Export PNG or print to PDF (via jsPDF).

Personal use only. SWU data © their respective owners.
