## v1.64.2 — audio lifecycle + night ambience hotfix

- Persistent Web Audio owners now receive a context only once it is genuinely `running`; Rain, Snow, Storm, night ambience and train no longer build loop sources into an autoplay-suspended context and hope to rebuild later.
- The shared AudioContext now observes its real `statechange` events. Browser interruptions/suspensions create a fresh readiness boundary, and returning to `running` rebuilds persistent ambience without requiring a Sound off/on cycle.
- A fresh browser reload can still legally require one ordinary page gesture before Web Audio is allowed to run. That is browser autoplay policy; after this pass any click/tap/key is sufficient — cycling the Sound control is not part of the recovery path.
- Night insect ambience was raised by about 6 dB in Calm/Clearing/Rain-front while remaining subordinate to weather. The recording, loop points and character are unchanged.
- Audio assets that finish decoding after the context has become suspended are not allowed to create stale loop sources.
- Added a deterministic startup test covering suspended-on-load → first real resume → unexpected interruption → resume recovery.
- v1.64.1 WaterLife cadence/clear hotfix and all visual/event scheduling are unchanged.

## v1.64.1 — WaterLife overnight hotfix

- Fixed a real long-session performance regression: the presence of any lotus no longer forces a full-screen transparent canvas clear/repaint at display refresh rate for the lifetime of the flower.
- Lotus-only cleanup is restricted to a narrow band around the real standing-water surface. Bubbles still use full-canvas cleanup because they can travel across the viewport.
- WaterLife now runs bubbles at ~30 fps, actively growing/opening/closing/burning lotuses at ~24 fps, resting buds/open blooms at ~6 fps, and returns to the existing 2 Hz heartbeat when empty.
- Lotus lifecycle, placement, appearance, event cadence, bubble appearance/capture behavior, and all world schedulers are unchanged.

## v1.64.0 — overnight stability + water-life refinement

This release folds the Codex long-session performance audit and the refined standing-water lifecycle into the v1.63.2 baseline without changing the world-event scheduler.

### Overnight/runtime stability

- Reworked audio warmup so compressed recordings can be cached without eagerly decoding the whole audio bank into PCM memory.
- Added a bounded 32 MiB LRU decoded-audio cache with pending-decode deduplication.
- Rain and snow audio loops now exist only while active or while their existing audible fade tails are still present.
- Continuous rain/snow/fire/storm gain updates replace old automation history instead of accumulating it over long sessions.
- Hardened suspend/resume handling so late audio resumes cannot reopen a hidden/backgrounded page.
- Added a backing-pixel budget for large fullscreen canvases, reducing native canvas memory on 4K/low-memory displays while preserving CSS geometry.
- Rare-event noise fields are lazy and completed rare layers stop their animation loops.
- Black terrain returns to its idle cadence even while residual wetness ages; wetness now continues to recede after standing water reaches zero.
- WaterLife avoids repeatedly clearing an already-empty canvas.

### Lotus lifecycle refinement

- Lotus now grows visibly from the water as shoot → bud → bloom rather than appearing as a finished flower.
- Bud/opening/closing geometry crossfades continuously so lifecycle boundaries do not visibly pop.
- Closed blooms sink and fade back into the water instead of disappearing abruptly.
- Added a barely perceptible stem sway while keeping the root point fixed at the standing-water surface.
- Placement searches the available water more reliably and enforces a minimum gap so multiple flowers do not collapse onto the same deep-water spot.
- Bubbles and their firefly-capture behavior are unchanged.

### Cleanup / release QA

- Event probabilities, cooldowns, and scheduler cadence are unchanged from the v1.63.2 baseline.
- Removed an unreferenced old stag prototype and local/performance debris that had no production role.
- Removed a stale duplicate public `/about/` page and unused `night-crickets-loop.mp3`; the canonical root `about/index.html` and approved `night-ambience-loop.mp3` remain.
- Service-worker cache bumped to `this-quiet-world-v1.64.0-stability-waterlife`.

See `PERFORMANCE_AUDIT.md` for the detailed Codex measurements and reproduction notes.
