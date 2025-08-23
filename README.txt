Bake-in overlay & underlay (auto-loaded on page load):

- assets/template_resized_1056x816.png  -> drawn UNDER cards
- assets/letter_poker_v2_fixed.svg      -> drawn OVER cards

Steps:
1) Drop 'script.v026h.js' and the 'assets/' folder into your site.
2) Update index.html to use the new script:
   <script src="script.v026h.js" defer></script>
3) Deploy (push to Git or `netlify deploy --prod --dir=.`).

Notes:
- Both images are auto-loaded on init; no user action required.
- You can still use the file picker to replace either during a session.
