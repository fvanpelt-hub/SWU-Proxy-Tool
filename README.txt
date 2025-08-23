SWU MTG-Skin Patch
------------------
Drop these files into the ROOT of your SWU site repo and deploy:
- index.html (skinned & includes nav back to MTG)
- mtg-skin.css (style overrides to match MTG site)

If your SWU repo already has a custom index.html, compare and merge; the critical part
is adding: `<link rel="stylesheet" href="mtg-skin.css">` and the `<nav>` element.
