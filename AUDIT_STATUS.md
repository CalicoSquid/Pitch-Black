# v1.65.2 audit response — status after v1.65.4

## Addressed in code

1. **Snow refresh-rate dependence** — normalized flake translation/rotation, wind easing and loose-powder motion to elapsed time; drift reshaping/erosion advances on a fixed 60 Hz material clock.
2. **Large cricket bed running silently** — the field recording is torn down in Alive phases whose ambience target is actually zero. Muted mode also suspends the shared AudioContext. The recording itself was deliberately not resampled/replaced in this pass.
3. **Train resume/unmute desynchronization** — ambient-life events carry a wall-clock `startedAt`; train visuals, bed offset, remaining duration and horn timing derive from it.
4. **Late owl playback after cancellation/unmount** — owl playback now validates the current rare-event identity, the transient-audio generation token, **and** a component-disposal flag immediately before decoded playback starts.
5. **Abrupt transition cleanup** — hero interruptions mark active ambient crossings for a 1.4 s visual exit; train audio fades on interruption; rain loops reach zero before their sources are stopped.
6. **Water-life pacing / missed lightning** — frame scheduling targets deadlines before the next rAF, and lightning dispatches a direct wake signal to WaterLife.
7. **Muted audio overhead** — non-audio controls no longer unlock Web Audio while sound is off, and mute suspends the context. Dormant-canvas backing-store release is intentionally deferred because it needs scene-specific restoration testing.
10. **Moon external dependency** — closed without changing the approved appearance. The exact realistic lunar image is now bundled as `/moon-realistic.webp`; both moon layers load it locally, with `/moon-texture.png` still underneath as the existing local base/fallback.
12. **Service-worker caching** — install/activate/cache work is lifecycle-owned; valid network responses are returned without awaiting `cache.put()`, while cache writes continue under `event.waitUntil()`. Navigation cache updates accept only successful HTML, and cache read/write failures do not poison a valid runtime fetch.

## Follow-up review fixes in v1.65.4

- **Owl disposal race:** pending owl decode completion cannot pass after `RareSkyEventLayer` unmounts.
- **Moon localization:** the approved realistic lunar layer is retained, but the image itself is now bundled locally as `/moon-realistic.webp`, eliminating the runtime NASA dependency.
- **30 Hz snow/firefly parity:** firefly interaction opportunities are accumulated per fixed material step; when two 60 Hz material steps occur in one 30 Hz render, both flake parity groups are evaluated. Repeated opportunities preserve the original per-step probability using the equivalent combined probability.
- **Response-path caching:** cache writes are no longer awaited by the response promise.

## Deliberately deferred / requires empirical pass

- **Full long-audio PCM reduction (#2):** the cricket and train recordings are still decoded by Web Audio when used. Reducing their decoded footprint further means resampling/downmixing the approved recordings or moving long beds to a streaming path; either can change playback quality/behavior and should be auditioned rather than slipped into a code-only hardening pass.
- **Dormant canvas release (#7):** worth doing only with explicit restoration tests so world continuity is not broken.
- **Mix consistency (#8):** needs a fixed-volume rendered-combination listening/measurement pass; no gain changes were guessed here.
- **Loop seam/repetition (#9):** needs multi-cycle audition; no accepted fire/snow sound was changed blindly.
- **Canvas reduced-motion coverage (#11):** should be implemented as a coherent accessibility behavior decision rather than disabling individual effects ad hoc.
- **Overnight proof (#13):** remains a device test, not something a source patch can honestly claim.

## Validation performed here

- Before this local-moon follow-up, the reviewed v1.65.4 source had **10 Node test cases passing** and **30 TS/TSX files** passing the available TypeScript transpile/syntax diagnostic.
- For this asset-localization follow-up, `public/sw.js` passes `node --check`, the bundled WebP is byte-identical to the uploaded `moon.webp`, both realistic lunar-image layers use `/moon-realistic.webp`, and no NASA runtime URL remains in `src`.
- The full Node/TypeScript suite could not be rerun from this extracted archive because dependencies are not installed in the container; the attempted test command stopped at missing local `typescript`, not at a source/test assertion. No fresh full-build claim is made here.
