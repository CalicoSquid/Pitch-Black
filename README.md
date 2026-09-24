## Development and release checks

Use Node 22.16 or newer and install the locked dependencies with `npm ci`.

- `npm run dev`: local development.
- `npm run check`: lint (including warnings), all Node regression tests, and the production build.
- `npm run test:browser:install`: install Chromium once.
- `npm run test:browser`: mobile/desktop controls, dialog interaction, and sunrise lifecycle checks; starts its own local server.
- `npm run test:performance`: the focused resource-budget regressions.

On Windows, use `npm.cmd` if PowerShell blocks npm.ps1. To use an installed Edge browser, set `PLAYWRIGHT_CHANNEL=msedge` for the browser tests.

The longer browser performance and soak scripts use the same pinned Playwright dependency. Start the app on port 4173, then run `node tests/browser-performance.mjs` or `node tests/browser-soak.mjs`. Reports go into ignored `.perf-tools/`; the tooling itself no longer lives there. Firefox/WebKit checks require installing those engines with Playwright. The lotus visual script uses the development server on port 5173.

## v1.66.9 — adaptive rendering and Raspberry Pi performance

- Snow keeps its detailed flakes, motion, wind and accumulation, but renders from a bounded cache of up to 128 tiny sprites rather than re-stroking every branch every frame.
- Procedural canvases use one shared scheduler, capped at 60 fps on the full profile and 30 fps on balanced/low. Recognized ARM/Linux browsers start balanced, including Raspberry Pi Firefox; other devices start full and adapt to measured missed frame deadlines / drawing cost. RAM is not used as a graphics-performance proxy.
- Persistent slow frames lower the profile for this page visit. Quality does not repeatedly rise and fall when scenes become idle. Canvas resolution changes preserve particles and world state; hidden tabs suspend procedural drawing and resume without creating duplicate loops.
- Registered procedural canvas backing stores share a total budget: 16 million pixels full, 8 million balanced, 4 million low, with additional per-canvas caps. Small sprite/texture caches, the separately drawn sunrise landscape and browser compositor allocations are outside that budget. Text and controls keep native resolution; backdrop blur is disabled on reduced profiles.
- For a conservative manual fallback, append `?quality=low` to the site URL (or `&quality=low` if it already has a query). `?quality=balanced` is also available. This is a per-visit setting, not a change to saved world/preferences.
- Adds governor, scheduler, total pixel budget and browser snow regressions. Includes a guard for snow's directional terrain loop at exceptionally narrow viewport sizes. Service worker cache bumped with the release.

Validation: production build, lint and 44 Node regression tests passed. Firefox production checks passed for controls at four viewport sizes, snow, 4K profile limits, scene changes, hidden/resume, storm/fireflies, resize, aurora and fog. Audio-dependent headless checks did not complete in this environment: the sunrise preview check fails identically on the original build, and the audio-resource check times out waiting for running audio sources. These are not reported as passing; audio and sunrise still need a device smoke test. At 1080p in the headless Firefox comparison, snow stayed near 60 fps while on-screen snow strokes fell from ~63,000/second to zero. At 4K the test environment fell back to low and remained functional (~15–16 fps); this is not a Raspberry Pi GPU benchmark or a promise of 30 fps on every device. The Pi's actual graphics-driver behavior still needs a device check after deployment.

To reproduce the rendering check: `npx playwright install firefox`, start a production preview on port 4173, then run `node tests/browser-render-budget.mjs`. Optionally set `PERF_COMPARE_BASELINE=1` with the old production build on port 4174. Run the controls suite in Firefox with `npx playwright test --browser=firefox`.

Deploy through the existing hosting workflow (`npm ci`, `npm run build`, publish `dist`). Once deployed, reload the Pi tab; a tab already open on the old JavaScript needs a reload to run the new code.

## v1.66.8 — bedside controls and release checks

- Clock, nighttime sound and More remain visible while scene/fullscreen controls scroll separately, with a visible scrollbar and a trailing fade on small screens.
- Opening settings immediately hides first-visit copy. Alarm setup explicitly explains that refresh/close cancels the alarm, and nighttime mute labels distinguish it from sunrise audio.
- Scheduler refs update after commit; preview completion and exit use cancellable timers. Lint remains enabled, with three documented local exceptions for synchronizing external world/audio resources.
- Adds locked browser tooling, a standard test/check entry point, browser regressions and CI. Includes the existing local CSS/dead-code cleanup.
- The production deployment was observed at v1.66.4 during the September 20 review. This release is prepared locally; deployment is a separate action.

## Sunrise interface and landscape

- Sunrise setup opens in a dedicated, readable dialog from More, with keyboard focus containment and Escape to close.
- At wake time, the bedside control dock temporarily becomes the Snooze / Finish surface instead of opening a second floating card. Snooze briefly confirms the next wake time in that same dock, then returns to the normal night controls.
- Preview closes setup so the dawn can be seen unobstructed, with direct preview exit and settings controls.
- Dawn reuses the deterministic ridges and trees revealed by lightning. A warm sun rises behind the landscape while the foreground remains dark; moon, night sky and storm visuals recede without resetting their state.
- The landscape canvas redraws only on entry/resize and releases its backing store after the exit fade. Reduced motion keeps the sun stationary.

## v1.66.4 — dawn landscape polish

- Refines the sunrise horizon without adding another animated system: the three deterministic ridge bands now use broad composed landforms with restrained procedural detail, smoother contour sampling, warmer atmospheric separation and more organic sparse conifer silhouettes.
- Tunes the dawn sky and sun so the newly visible landscape reads as one quiet scene rather than stacked color bands, while preserving the same bounded one-shot landscape canvas and underlying world behavior.
- Snooze now means fully back to sleep: sunrise light fades all the way to zero, remains true night through the quiet middle, then begins a fresh three-minute dawn into the nine-minute snoozed wake time. Nighttime ambience returns according to the user's existing settings while wake birds/chime remain silenced until the re-rise.
- Adds regression coverage that the snooze visual floor is exactly zero before the new dawn ramp.

## v1.66.3 — sunrise audio hardening

- Snooze now explicitly fades and stops the natural bird bed through its quiet middle, then allows a fresh/reused source to return only during the final three-minute snooze re-rise.
- Setting wake volume to zero during preview is an immediate fade-to-silence command for any birds already playing; it no longer merely prevents future starts.
- Sound Check → Arm is now a memory boundary: transient check playback is stopped and decoded morning PCM is released before waiting overnight, while the ~1.2 MB compressed recording is retained for late-dawn decode without another fetch.
- Adds focused regressions for below-threshold bird shutdown/restart, zero-volume silencing, compressed-only armed waiting, and the snooze ambience lifecycle.

## v1.66.2 — natural morning ambience

- Adds the supplied CC0 zidzid/Freesound summer-dawn field recording as the sunrise's natural morning bed. Birds begin only in the latter part of dawn, grow gradually with the light, and remain separate from nighttime mute/volume.
- Keeps the restrained chime as the clearer wake-time cue. Sound check now demonstrates the field recording plus one chime; the accelerated sunrise preview fades birds in before the wake cue.
- The original 18 MB WAV is not shipped. The web derivative is a ~97 s stereo 32 kHz / 96 kbps MP3 (~1.2 MB), with a 6 s equal-power circular seam and +5 dB source gain.
- Arming primes only the compressed asset. Decoded PCM is deferred until late dawn and released with the alarm, keeping overnight idle memory close to the previous build.
- Async bird fetch/decode and playback share the existing alarm-generation cancellation rules, so Snooze, Finish, Cancel, preview exit and unmount cannot start a late morning source.

## v1.66.1 — sunrise follow-up hardening

- Adds crawlable, no-JavaScript `/rain-sounds/` and `/bedside-clock/` discovery pages while keeping `/about/` consolidated at `about/index.html`.
- Adds one-shot Rain/Clock/Sunrise entry intents that preserve unrelated saved preferences and never auto-enable sound.
- Adds an in-browser sunrise wake-up with absolute local-time scheduling, 10/20/30 minute dawn lengths, bounded glow, separate wake sound, sound check, accelerated preview, wake-lock status, 9-minute snooze and a bounded 20-minute morning hold.
- Sunrise is a temporary overlay and temporary night-audio duck: the underlying world keeps evolving, current user changes are never overwritten by an old snapshot, and Finish fades the dawn away over about 20 seconds.
- Wake audio uses a separate graph so an explicitly audible alarm is independent of nighttime mute.
- Static-page service-worker navigation normalizes slashless and `/index.html` aliases before cache-key selection, so discovery-page redirects cannot overwrite the cached homepage and failed static routes never substitute the app homepage.
- Restores the control dock’s `:has(:focus-visible)` keyboard-only pinning, fixes snooze hold expiry to follow the latest snoozed wake, invalidates delayed wake-audio starts on Snooze/Finish/Cancel, and gives preview/edit cancellation an explicit visual fade-out phase.

## v1.65.4 — audit hardening

- Snowflake motion, rotation, wind easing, loose powder and drift-material updates are now normalized to elapsed time / a 60 Hz simulation baseline instead of display refresh rate.
- The large cricket field recording is released whenever its Alive phase is genuinely inaudible, and muted mode suspends Web Audio instead of leaving an idle context running.
- Train visuals and audio now share the event's wall-clock start time. Resume/unmute continues the bed and horn from the correct point rather than restarting the journey.
- Owl field-recording playback validates both the live rare-event identity and the current transient-audio generation immediately before starting.
- Hero-event interruption gives train/lantern crossings and train audio a short exit fade instead of hard removal; rain loops now reach zero before their sources stop.
- Water-life scheduling targets frame deadlines and wakes immediately when lightning begins, so resting lotuses can catch brief flashes without running at weather-frame cadence.
- Service-worker install/activate/cache work is attached to the event lifecycle, navigation cache writes accept only valid HTML responses, and cache-write failures no longer poison successful fetches.
- The approved realistic moon remains visually unchanged, but its realistic lunar surface is now served from the bundled `/moon-realistic.webp` instead of a runtime NASA request. `/moon-texture.png` remains underneath as the existing local base/fallback.
- Owl decode completion now also checks a component-disposal flag, closing the remaining unmount race.
- Firefly/snow interaction checks are counted per fixed material-simulation step, so 30 Hz rendering cannot starve one flake parity group.
- Runtime cache writes remain owned by `event.waitUntil()` but no longer sit on the successful response path.

The approved recordings and core rare-event/weather visuals were not replaced or restyled in this pass.
