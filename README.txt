Baked-in trim guides (no asset needed) + always-on drawing.

1) Replace your script tag to use script.v026g.js
   <script src="script.v026g.js" defer></script>

2) (Optional) Hide the overlay section (checkbox/slider/file) completely:
   <link rel="stylesheet" href="hide-overlay-section.css">

Notes:
- Guides are computed from your current sheet settings (rows/cols/card size/margins).
- They draw ON TOP of the cards during render.
- You can keep the file chooser if you still want to load a custom overlay image;
  if present it will still be drawn by v026f logic, *plus* these guides.
