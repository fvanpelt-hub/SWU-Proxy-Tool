# SWU Silhouette Sheet Tool

- Exact print scale: **3300×2550** (Letter landscape @300DPI)
- Cards: **2.5×3.5 in** (750×1050 px), layout **4×2**
- Always-on vector overlay: `assets/letter_poker_v2_fixed.svg` (solid black corners)
- Optional template image input (default baked-in vector is used)

## Deploy (Netlify)
Push to GitHub, then connect the repo to Netlify. Functions are in `netlify/functions`.

## Git push commands

```bash
# from the project folder
git init
git remote add origin https://github.com/<you>/<repo>.git
git add .
git commit -m "Add SWU Silhouette Sheet Tool (exact scale, baked overlay)"
# if the remote has commits already
git pull --rebase origin main || git pull --rebase origin master
git push -u origin main || git push -u origin master
```
