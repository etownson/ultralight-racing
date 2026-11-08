# Headless tests

Node + jsdom (`npm i jsdom@24` in this folder). `harness.js` loads `../index.html` with the renderer, canvas and audio stubbed, injects `window.__T.ev()` into the game closure, and runs several game pages on a shared virtual clock with a mock live room (event messages cross with 40–90 ms latency, presence doesn't).

- `pvp.js [--ai] [--t=300]` — 3 pilots (autopilot bots) in a PVP dogfight: join, scores agree on every screen, end, results, rematch, payload size
- `pvpai.js` — 2 pilots with AI bandits: bandit respawns, time-limit end, host leaving
- `pvpshot.js` — controlled shots: gun damage, takeoff shield, kill credit, repairs, missiles (60), crash credit
- `reg.js` — regressions: solo combat, race, time trial, co-op combat, live race
- `race.js [--src file]` — one race with the auto-flown player (compare builds)
