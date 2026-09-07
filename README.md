## Alarm-time audio

Dawn changes the visuals only. Nighttime audio stays at its configured level until the selected wake time, when birds/chime and Snooze/Finish begin. Snooze keeps wake sound off until the next alarm time. Preview follows the same order.

## Sunrise interface and landscape

- Sunrise setup opens in a dedicated, readable dialog from More, with keyboard focus containment and Escape to close.
- Wake-up shows large Snooze and Finish controls directly over the world. Snooze keeps its next wake time visible.
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
