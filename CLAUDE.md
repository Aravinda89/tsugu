# 継ぐ Tsugu · mend & carry on

## Name
- **Project name:** Tsugu (継ぐ), meaning "to mend" and also "to carry on".
- **Repo:** `tsugu`. Vite `base` is `/tsugu/`, and the site lives at `<username>.github.io/tsugu`.
- **Title inside the experience:** the kanji **継ぐ**, with "Tsugu · mend & carry on" in small letters beneath it.
- **Browser tab title:** `Tsugu · mend & carry on`

## What this is
An interactive 3D web experience based on **kintsugi**, the Japanese art of mending broken pottery with gold, and the wider idea of **wabi-sabi** (beauty in imperfection and impermanence).

The visitor chooses a clay pot, drops it, watches it shatter, gathers the pieces back, and the cracks fill with gold. Every break is unique, so every finished pot is unique.

It is a short ritual of 1–2 minutes, not a game or a puzzle. It should feel calm and slow, with almost no text.

This is a portfolio pet project and must deploy for free (GitHub Pages).

---

## Experience flow
1. **Choose.** Three handmade-looking clay pots sit on a low wooden surface. The user taps one.
   - Sri Lankan clay chatti: wide round belly, short neck, wide mouth
   - Tall water pot: narrow neck
   - Japanese-style tea bowl (chawan): low and wide
2. **Lift and drop.** The user drags the pot upward, and releasing drops it onto the floor. A higher lift means a harder impact and more pieces, within limits.
3. **Stillness.** After the shards settle, there are about 3 seconds of silence before a subtle prompt appears.
4. **Gather.** The user taps a shard, and it lifts and floats back to its place on the pot with a smooth ease.
   - There is no dragging and no rotating of pieces; this is not a jigsaw puzzle.
   - The user chooses the order.
5. **Gold.** Once every shard is back, dark urushi lacquer flows along each crack over a few seconds.
   - **Trace (Phase 4):** the user lays the gold by drawing along the cracks. ✦ gilds the rest automatically, and ✓ finishes. Untraced cracks stay lacquer.
6. **Keep.** The pot turns slowly on a turntable, and the user can orbit around it.
   - "Save" downloads a PNG.
   - "Again" returns to step 1.

UI text is at most one short line per step, such as "Lift the pot" or "Gather the pieces". There are no paragraphs.

---

## Tech stack
- **Vite + plain Three.js** (JavaScript, ES modules). No React.
- **Physics:** `@dimforge/rapier3d-compat`. Its WASM is inlined, so it works on static hosting.
- **Animation:** a small hand-written tween helper. Do not add an animation library.
- **Lighting:**
  - `RoomEnvironment` + `PMREMGenerator` for reflections, so no HDRI file is needed.
  - One soft directional light with shadows.
  - A shadow-catcher floor.
- **Deploy:** GitHub Pages through GitHub Actions. Set Vite `base` to `/tsugu/`.
- **Tests:** Vitest for the geometry and fracture code.

---

## Key technical approach

### Procedural pot
- Generate each pot from a 2D profile (radius against height) as a solid shell with thickness: outer surface, inner surface, rim and base.
- The profile starts at the centre of the base, so the base is part of the same surface.
- Add subtle irregularity so no pot is perfectly symmetric:
  - low-frequency noise on the radius by angle and height
  - a slightly uneven rim
- Use seeded randomness everywhere, so a pot type plus a seed always reproduces the same pot and the same break.
- **Clay material:** warm terracotta with colour variation, high roughness, a procedural noise texture, and an unglazed look.

### Fracture (most important part)
Do **not** use CSG libraries or pre-fractured Blender models. The pot is a surface of revolution, so fracture it in its 2D parameter space:

1. **Parameter domain.**
   - `u` is the angle around the pot (0–1, wraps around).
   - `v` is the distance along the profile from the base centre to the rim (0–1).
2. **Seeds.**
   - Scatter N seed points in (u, v) space, with N about 12–20.
   - Cluster more seeds near the impact point, so pieces are smaller where it hit.
3. **Voronoi.**
   - Compute a 2D Voronoi diagram that is periodic in `u` (duplicate the seeds at u ± 1).
   - Scale `u` and `v` by the real circumference and profile length, so the cells are roughly even in world space.
   - Add slight noise to the cell edges so the cracks aren't perfectly straight.
4. **Shards.** Each Voronoi cell becomes one shard mesh:
   - the outer surface and inner surface sampled over the cell polygon
   - side walls along the cell boundary for the broken edge, using a rough raw-clay material
5. **Rest transform.** Store each shard's rest transform (where it sits in the intact pot), so mending is just a tween back to rest.
6. **Crack lines.** Keep the boundary polylines in 3D on the outer surface, the inner surface and across the rim. These are the exact crack lines used for the gold.
7. **Timing.** Generate the fracture during the lift or at impact, so every break is unique.

**As built (Phase 2).** The Voronoi runs on the intact pot's own mesh grid in (u, v), still periodic in u.
- **Labelling:** each grid vertex takes its nearest seed by 3D distance, with per-seed noise on that distance.
- **Why:** a flat (u, v) chart pinches cells into wedges at the base centre.
- **Cutting:** quads are cut along the cell boundaries. Shard outer and inner surfaces reuse the intact mesh's vertices, so the swap is seamless.
- **Rim:** strips are added where a shard reaches the lip.
- **Walls:** broken side walls have a dark fired core.
- **Off the main thread:** the fracture runs in a Web Worker (`fracture/worker.js`) at release, while the pot falls.
- **Physics shapes:** shards use compound convex hulls (up to 4 parts), so curved pieces don't rest on invisible lids.
- **Crack lines:** `fracturePot` returns them in pot-local space (`cracks.outer`, `cracks.inner`, `cracks.rim`) for the gold.

**Unit tests:**
- The shards cover the whole pot with no gaps or overlaps (the sum of shard areas is about the pot's area).
- Neighbouring shards share identical boundary vertices.

### Physics
- **Falling pot.** While falling, the intact pot is one dynamic body with a convex hull collider.
- **Impact.** On first floor contact above a speed threshold, swap the pot for its shards in the same transform.
- **Shards.** Each shard is a dynamic body with a convex hull collider built from its vertices.
  - Initial velocity = pot velocity + a small outward impulse away from the impact point + some spin.
- **Floor and bounds.** The floor is a fixed cuboid, with invisible bounds that keep the shards on screen.
- **Settling.** When all shards are nearly still, switch to the Stillness step and then the Gather step.

### Mend
1. Tap a shard (raycast).
2. Remove its physics body.
3. Tween its position and rotation back to rest along a gentle upward arc over about 1.2 seconds.
4. When all shards are home, replace them with the intact pot mesh (this avoids hairline gaps and flicker) and add the gold seam meshes.

### Gold seams
- **Geometry.** Build thin ribbons along the crack polylines, slightly raised off the surface, on the outside, inside and rim. Give them a slightly irregular width, like hand-applied lacquer.
- **Material.**
  - `MeshPhysicalMaterial`, metalness 1, roughness about 0.25, warm gold colour.
  - It depends on the environment map for reflections; without it the gold looks brown.
- **Reveal.** Grow each line along its length (draw range or a shader clip by arc length), so the gold appears to flow into the cracks.

**As built (Phase 4).**
- **Coverage:** each gold ribbon vertex carries `aGold` (0..1), the gold laid by tracing.
- **Shader:** `g = max(reveal, traced)`, so traced gold also lands grain by grain and glints as it catches.
- **`trace.js` stroke:** raycasts the pot, snaps to the nearest crack segment within 0.05 (`nearestOnCracks`), and paints with a falloff. Slow strokes are wide and full; fast ones are thin and light.
- **Gaps:** samples are interpolated, so quick strokes stay continuous.
- **Gesture split:** a capture-phase `pointerdown` on `document` disables OrbitControls for presses that land on the pot.
- **Finishing:** Keep follows ✓, ✦ (the `uGild` reveal), or about 1.4 s after a stroke that leaves more than 90% covered.
- **Strokes:** stored on `gold.strokes` (pot-local points) for the Phase 6 shelf.

**As built (Phase 3).**
- **Reassembly:** the pot is put back together at `HOVER` above its stand, so pieces still on the stand are never in the way. When whole, it swaps for the intact mesh and settles onto the stand.
- **Gather physics:** keeps stepping, so pieces resting on a lifted one fall.
- **Tapping:** a near miss (within 56 px on screen) picks the nearest piece.
- **Gold shader:** one `MeshPhysicalMaterial` patched with `onBeforeCompile`.
  - `uFlow` clips by per-line arc length (urushi runs).
  - `uGild` turns grains of lacquer to gold at their own moment.
  - The room reflection is scaled down on un-gilded lacquer, or wet urushi reads white.
- **Gold colour:** deeper than textbook gold (`0.8, 0.46, 0.09`, `envMapIntensity` 0.6), because a thin bead is mostly highlight and paler gold tone-maps to cream.
- **Gold environment:** the material takes `envMap` directly. A material that relies on `scene.environment` gets the dark room's `environmentIntensity` (0.22) instead.
- **Crack data:** crack lines carry surface normals (`{ points, normals }`) from the fracture.
- **Keep:**
  - The pot and stand turn together.
  - OrbitControls are enabled only in this step (no pan, limited zoom and polar angle).
  - Save composites the haze, vignette and hanko onto the frame (`save.js`).
  - The mei comes from `mei.js`.

---

## Performance and mobile
It must run smoothly on mid-range phones.

- Touch first: use pointer events, not mouse-only events.
- Cap `pixelRatio` at 2.
- Use no more than 20 shards.
- Only one shadow-casting light.
- Keep gestures separate:
  - A single finger lifts, taps and (later) traces.
  - Moving the camera is allowed only in the Gather, Trace and Keep steps.
    - In Gather, a drag orbits and a short tap picks a piece.
    - In Trace, a press on the pot paints, and a press on the background orbits.
  - **Camera controls:**
    - One finger or left mouse orbits; two fingers or right mouse pans (held near the pot); pinch or wheel zooms toward the pointer.
    - A double-tap on the background recentres.
    - ＋ / − / ◎ buttons at the right edge do the same.

---

## Project structure
```
src/
  main.js              app start + state machine:
                       choose → lift → fall → shatter → still → gather → gold → keep
  scene.js             renderer, camera, lights, environment, floor
  pot/profiles.js      the three pot profiles
  pot/buildPot.js      shell geometry + irregularity + clay material
  fracture/voronoi.js  periodic 2D Voronoi
  fracture/shatter.js  cells → shard meshes + crack polylines
  physics.js           Rapier world wrapper
  mend.js              tap-to-return logic
  gold.js              seam geometry + reveal animation
  ui.js                minimal prompts and buttons
  audio.js             sound hooks (placeholders until sounds are added)
  utils/random.js      seeded random
  utils/tween.js       small tween helper
tests/                 Vitest tests for voronoi + shatter
```

---

## Build phases
Do one phase at a time, and stop after each one so I can test it in the browser and on my phone.

1. **Scene and pots.** Scene, the three procedural pots, the Choose step and the clay look. Also set up the GitHub Pages deploy pipeline.
2. **Break.** Lift and drop, fracture, and the physics shatter.
3. **Mend.** Tap to mend, gold seams with the reveal, and the Keep step (turntable, Save PNG, Again). **This completes the first version.**
4. **Trace the gold yourself.**
   - After mending, the user draws along the cracks with a finger or mouse.
   - Gold appears only where they trace, snapped to the nearest crack, and their imperfect strokes stay.
   - Add an "auto-gold" button as a fallback.
5. **Lost piece and sound.**
   - One small shard is "lost", and its hole is filled with solid gold, as real kintsugi sometimes does.
   - Add sound design using CC0 sounds: impact, ceramic clinks, soft ambience.
6. **Share and shelf (optional).**
   - **Share link.** Put the pot type and seed in the URL, e.g. `?pot=chatti&seed=123`, so anyone can open the same mended pot. This needs no backend.
   - **Shared shelf.** A gallery of everyone's mended pots on a free backend (Supabase or Firebase). Store only the pot type, seed and traced strokes, not images, because pots can be regenerated.

---

## Design rules
- Calm, warm and minimal: soft lighting, earthy tones and slow pacing.
- Never a puzzle: no timers, no scores, no way to fail.
- Imperfection is intentional:
  - uneven pot shapes
  - irregular gold width
  - pieces may return with a tiny misalignment
- Almost no text. Don't explain kintsugi inside the experience, except for one optional line at the very end.

## Art direction (from the user's mockup)
- **Mood:** a low-key studio still life.
  - Very dark warm-brown room, where floor and wall melt together with no horizon.
  - Strong vignette and a faint warm haze behind the pot.
- **Light:** one warm key light from the upper left and front, falling through a soft shōji lattice. The shadow side falls to near black.
- **Clay:** matte, rough, unglazed terracotta, mottled, with specks and pits. It darkens toward the base.
- **Stands:** each pot sits on its own dark, weathered, cracked wooden stand with feet.
- **UI:** gold (`#dcb76c`), with hairline rules and pill borders.
  - 継ぐ written vertically at the top left.
  - Icon-only pill buttons centred at the bottom, with `aria-label` and a hover tooltip.
  - One short serif prompt line.
  - **Legibility:** text must stay clearly readable. Use semi-bold weights (Cormorant Garamond and Shippori Mincho 600), a soft dark text shadow, and no faint or hairline-thin type.

## Japanese touches (decided)
Draw from craft and tea-room tradition, never decoration: no sakura, torii or "oriental" fonts.
- **Done in Phase 1:**
  - shōji light cookie
  - dust motes drifting in the beam (*ma*)
  - vertical 継ぐ
  - `ease.joHaKyu` (序破急) for slow, meaningful moves
- **Phase 2:** use jo-ha-kyū for the stillness fade.
- **Phase 3:**
  - Use jo-ha-kyū for shard returns.
  - **Gold reveal in two stages:** a dark urushi lacquer line flows along the crack first, then gold dust settles onto it and it turns gold.
  - **Keep:** the single end line is the pot's seeded **mei (銘)**, a two-kanji poetic name with its English, e.g. 夕霧 · evening mist. Add its kanji to the Shippori Mincho `text=` font subset.
  - **Save:** the PNG gets the vignette and a small vermilion 継 **hanko** seal.
- **Phase 5 sound:** soft rain, water-drip chimes (*suikinkutsu*), and one *rin* bell when the gold completes.
- **Decided against:** a hanging-scroll alcove, a seasonal falling leaf, and a separate 一期一会 line.

## Working agreements
- Work one phase at a time. At the end of each phase:
  - run the dev server
  - check the browser console for errors
  - tell me exactly what to test
- Keep dependencies minimal, and explain any new dependency before adding it.
- Commit after each working phase with a clear message.
