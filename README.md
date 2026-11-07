# Ultralight Racing 3D

A browser-based 3D ultralight racing game, made for friends. Everything — game code and Three.js r159 — lives in one self-contained file, `index.html`.

**Play:** https://claude.ai/artifact/JX51aHcu6bNdjfo7wtrYFE

To run locally, open `index.html` in a browser (Chrome/Edge recommended for gamepads).

Courses: **Lazy Sunday** (gentle), **Hump Day** (the original), **Manic Monday** (tight and steep), picked on the title menu.

Modes: **Race** (3 AI rivals, pickups), **Time Trial** (solo against your best ghost), **👥 Live** (race or free-fly with friends who have the game open — needs the artifact on claude.ai and an email invite; not available in a local copy) and **Free Flight**.

## Files

- `index.html` — the game (the same file that is published as the artifact)
- `docs/design-notes.md` — flight model, AI rivals, controls, tuning history and testing approach

## Workflow

Changes are made with Claude, published to the artifact, and committed here so every build has a message and a diff. To roll back, check out an earlier `index.html` and republish it.
