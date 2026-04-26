EmpireX - Slots
================

A simple 3-reel slot machine for ourempirex.com/game.

Two symbol sets are toggled via the tabs at the top: "Fun" and "More Fun".
All artwork is EmpireX-original (sourced from /game/img/ and composed into
reel strips by .github/scripts/build-game-strips.py).

Wins (three matching values across the rows) get a "Save as PNG" button
that exports the current display - including the ourempirex.com/game
caption - for sharing.

Architecture
------------
- index.html       -> bootstrap, tabs UI, html2canvas + React 15 from cdnjs
- css/style.css    -> reels, animations, tabs, save button, URL caption
- js/index.js      -> React 15 components (App / Row / Results) + tab switcher
- img/strip-1.png  -> "Fun" reel strip (built from 1symbol-{a,b,c}.png)
- img/strip-2.png  -> "More Fun" reel strip (built from 2symbol-{a,b,c}.png)

To rebuild the reel strips after dropping new symbol images into /img/:
  python .github/scripts/build-game-strips.py

Original code derivation
------------------------
The React structure and reel-scrolling CSS in this game are derived from a
CodePen by Dario Corsi (pen AXyxpp), provided under an MIT-style license.
The original notice is preserved at license.txt as required.
