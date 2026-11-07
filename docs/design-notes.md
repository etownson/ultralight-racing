# Ultralight Racing 3D — design & tuning notes

Live game: https://claude.ai/artifact/JX51aHcu6bNdjfo7wtrYFE (single self-contained HTML, Three.js r159 inlined).

## Flight model (aerobatic since 2026-11-06; Arcade removed 2026-11-03)
Every plane (player, rivals, title demo, free-flight traffic) uses the same physics.
- **Attitude is a full 3D frame**: `r.f` (nose = flight path) and `r.u` (wing-up). `hd`/`pitch`/`bank` are derived each step (`syncAngles`). Any code that writes hd/pitch/bank directly (respawn, bonk, world bounds, ground bounce, ceiling) is picked up by `ensureAtt()`, which rebuilds the frame when those values changed. Mesh orientation is set from the frame (quaternion), plus a small visual angle-of-attack tilt under g.
- **Elevator = lift coefficient** c (fraction of max): `elevToC(e)`; neutral c = .25 = 1 g at trim 24 m/s (≈86 km/h). Back half keeps the old "pull = slower" curve (e=1 → 1.19); push goes through zero to C_MIN −0.7 (negative g, inverted flight needs ~¾ forward stick). Load factor n = c·(V/VSTALL)² + pitch damping (KD 1.2 × smoothed accel, fades out at high g) — keeps the phugoid from porpoising; hands-off settles at trim speed.
- **G limit** +6 / −3 (elevator authority caps c at G_MAX/q). **Stall barrier**: above ~1.35×VSTALL full back only pulls to c .97; below ~1.15–1.35×VSTALL the stick can drag it past c = 1 → stall. Stalled: lift capped at c .5, nose drops, spin/rudder logic as before. Recovers when c < .85 and V > 1.1·VSTALL, or automatically once V > 1.6·VSTALL. Extra stall trigger: V < .62·VSTALL while nose up (tail-slide/hammerhead).
- **Ailerons = roll rate** for the player: ROLL_MAX 2.0 rad/s (~115°/s), scaled by speed (35% at low speed). Dihedral: stick centred and |bank| < 70° → eases back toward level (.55·sin bank rad/s). Rudder yaws (.35) and rolls a little (.25).
- Induced drag uses the actual load factor (pulling costs energy). Constants: VSTALL 12, VTRIM 24, CD0 .0024, CI 230, PHI_MAX .85 (rival bank limit).
- **Engine power (raised 2026-11-06, "too anemic"):** TMAX 3.6 → **5.2**, GROUND_THRUST 4.2 → **5.6**. Effect: takeoff roll 11.4 s / 171 m → 7.1 s / 105 m; full-power climb ~3.9 → ~8.2 m/s; level top speed ~139 → ~168 km/h (√(TMAX/CD0)).
- Ground roll: ground accel = GT·thr − .9 − .004V² − g·sinθ. Takeoff rotation when V > max(1.1·VSTALL, hands-off speed for stick+trim). B = wheel brakes. Engine heats only in the air above 85% throttle.
- World ceiling 260 m for aerobatic room.

## Elevator trim (player)
D-pad ↑/↓ (keys T = nose down, G = nose up). Step .05, hold repeats after .35 s. D-pad direction follows the pitch setting (default up = dive, so d-pad up trims nose down). Range TRIM_DN −.35 … TRIM_UP +.6 ≈ hands-off 118 … 58 km/h. Reset to neutral on new race / respawn. HUD shows G and "TRIM ▲/▼ xx km/h" above the instrument strip (advisories moved up).

## Look views
Hold d-pad ←/→ (keys Z / C): snaps (~0.1 s) to a cockpit eye inside the helmet looking out past the strut, ~17° down, FOV 74 — for lining up on the runway. Release returns to chase cam. HUD shows "◀ LOOKING LEFT / RIGHT ▶".

## Chase camera
Normal flight: unchanged level-horizon chase. Past ~55–75° bank or ~35–57° pitch (or inverted) it blends (`camAero`) into a full attitude-following chase (behind the nose, camera up = wing-up) so loops and rolls don't flip.

## Rival pilots (aiControl)
Fly like a pilot: stick holds a target speed, throttle holds climb rate. On the aerobatic model they use an **autopilot inner loop**: the old speed-hold pitch law (γ̇ = 2(V−vcmd)/vcmd + 4·accel/vcmd − .55(n−1), pitch kept within −.9…+.6) is turned into the lift coefficient that produces it (`r.cAI`, capped at .92 so they stay out of the buffet); bank held with a proportional roll loop (AI_ROLLK 8) toward steer·PHI_MAX. Other behaviours:
- Corner speeds per ring from banked-turn radius that fits the next leg; braking distance (drag-only, ~1.4 m/s²) planned for this ring and the next.
- Follow the line from the previous ring (runway axis for the first pass); hairpins (≥90°) take the inside 3 m.
- Climb-out after takeoff at full power and ~17 m/s; climb speed 19 m/s when below the ring.
- Never bank harder than current speed safely allows. Missed ring → teardrop recovery.
- Difficulty (DIFFS): Easy/Normal/Hard set cruise skill, corner push (cf), throttle cap, sloppiness.
- **Power-bump fixes (2026-11-06)** — with TMAX 5.2 Hard rivals initially missed 4–8 rings/race by flying over them. Three changes:
  1. Throttle correction terms (vertical-speed and ±.3 speed nudges) scaled by 3.6/TMAX so loop gain is unchanged.
  2. While descending to a ring (eh < 0), rival throttle capped at 3.6/TMAX (the old full power) — otherwise they arrive too fast, pull up to brake and zoom over.
  3. Boosting, or faster than the stick can command (pcmd at −1 and V > vcmd+1): autopilot flies the flight path to the ring (γ̇ = 2.5·(asin(vsd/V) − pitch)) instead of speed-hold, which used to zoom them up.
- Sim medians (jsdom harness, all-AI races, pickups on, 6 races/difficulty). Pre-power-bump: Easy ~360 s, Normal ~341 s, Hard ~307 s. After: Easy ~328, Normal ~312, Hard ~298. Stalls 0; ring misses back to the pre-bump level (~9 per 3 Hard races). Note the player gains more from the extra power than rivals (rival cruise targets unchanged: 20+16·skill m/s), so races are somewhat easier — raise rival cruise if friends find it too easy.

## Course
14 rings; ring 0 raised to 14 m (runway clearance); ring 6 lowered (ALT 50) and ring 12 moved to ease the ring-11 hairpin to 96°. Grid at runway start (118/134 m behind ring 0); clear zone past the runway's departure end.

## Controls (controller)
Left stick fly (roll / pitch) / right stick throttle (swappable) · LT/RT rudder · LB/RB pickups · B brakes · A confirm/respawn · X free flight / runway reset · Start pause · Y mute · **D-pad ↑↓ trim, ←→ hold to look** (d-pad still navigates menus; it no longer flies the plane). Pitch default Up = dive. Keyboard: arrows/A-D fly, W/S throttle, Q/E rudder, T/G trim, Z/C look.

**Non-standard layouts (2026-11-06):** a friend on Windows (likely Firefox) had rudder on View/Menu — the browser gave the raw DirectInput order instead of the W3C "standard" mapping. `stdPad()` now rebuilds a standard-shaped pad for Xbox-like ids (xbox/xinput/045e/microsoft) when `mapping !== 'standard'`: buttons A B X Y LB RB View Menu LS RS; triggers from a combined Z axis (axes[2], LT +, RT −) or two separate axes (2 and 5, auto-detected when both rest at −1); right stick axes 3/4; d-pad from hat axis 9, axes 5/6, or buttons 10–13. Title-screen pad status shows "Xbox fallback layout" plus live LT/RT values for checking. Combined-Z trigger sign is a best guess — if rudder is reversed for someone, flip it there. Chrome/Edge give the standard layout and are unaffected.

## Testing approach
Node + jsdom harness: loads the page with WebGL renderer, canvas 2D and rAF stubbed, injects `window.__T={ev:c=>eval(c)}` into the game closure, then steps `update(1/60)` (or `frame(t)` for HUD) directly. Fake pads via `navigator.getGamepads` stub. Scripts used: race medians per difficulty (finish times, ring misses, stalls, bonks), ring-miss diagnosis (height/lateral offset and boost state at each miss), ring-split traces, takeoff/climb comparison against the previous build, loop / roll / inverted / dihedral / trim / look / landing maneuvers.
